import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { bearerToken, secureSecretEqual } from "@/lib/integration-token";

export const runtime = "nodejs";

type TournamentPayload = {
  externalId: string;
  name: string;
  type?: string | null;
  status?: string | null;
  tournamentDate: string;
  startTime: string;
  venue?: string | null;
  format?: string | null;
  participants?: number;
};

type PlayerPayload = {
  externalId: string;
  tcExternalId?: string | null;
};

type SyncPayload = {
  source?: string;
  tournaments?: TournamentPayload[];
  players?: PlayerPayload[];
};

export async function POST(request: Request) {
  const expected = process.env.VDC_TURNIER_SYNC_TOKEN;
  const provided = bearerToken(request);

  if (!expected) return NextResponse.json({ error: "Turnier sync token is not configured." }, { status: 503 });
  if (!provided || !secureSecretEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  let payload: SyncPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (payload.source && payload.source !== "vdc_turnier") {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }

  const tournaments = Array.isArray(payload.tournaments) ? payload.tournaments : [];
  const players = Array.isArray(payload.players) ? payload.players : [];

  try {
    for (const tournament of tournaments) {
      if (!tournament.externalId || !tournament.name || !tournament.tournamentDate || !tournament.startTime) continue;

      const participants = Number.isFinite(Number(tournament.participants))
        ? Math.max(0, Number(tournament.participants))
        : 0;
      const startsAt = `${tournament.tournamentDate.slice(0, 10)} ${tournament.startTime.slice(0, 8)} Europe/Berlin`;
      const description = [
        tournament.type,
        tournament.format,
        tournament.status ? `Status ${tournament.status}` : null,
        `${participants} Teilnehmer`,
      ].filter(Boolean).join(" · ");

      const eventRows = await sql`
        INSERT INTO club_events (
          title,event_type,starts_at,location,source,external_id,description
        )
        VALUES (
          ${tournament.name},
          'tournament',
          ${startsAt}::timestamptz,
          ${tournament.venue ?? null},
          'vdc_turnier',
          ${tournament.externalId},
          ${description}
        )
        ON CONFLICT (source,external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          title=EXCLUDED.title,
          starts_at=EXCLUDED.starts_at,
          location=EXCLUDED.location,
          description=EXCLUDED.description,
          deleted_at=NULL,
          deleted_by=NULL,
          delete_reason=NULL,
          updated_at=now()
        RETURNING id::text
      `;

      const eventId = eventRows[0]?.id ? String(eventRows[0].id) : "";
      if (eventId) {
        await sql`
          INSERT INTO integration_entity_links (
            integration_key,entity_type,external_id,local_id,metadata,last_synced_at
          )
          VALUES (
            'vdc_turnier','tournament',${tournament.externalId},${eventId}::uuid,
            jsonb_build_object(
              'type',${tournament.type ?? null},
              'status',${tournament.status ?? null},
              'format',${tournament.format ?? null},
              'participants',${participants}
            ),
            now()
          )
          ON CONFLICT (integration_key,entity_type,external_id)
          DO UPDATE SET local_id=EXCLUDED.local_id,metadata=EXCLUDED.metadata,last_synced_at=now()
        `;
      }
    }

    for (const player of players) {
      if (!player.externalId) continue;
      const tcId = player.tcExternalId || player.externalId;
      await sql`
        INSERT INTO integration_entity_links (
          integration_key,entity_type,external_id,local_id,metadata,last_synced_at
        )
        SELECT
          'vdc_turnier','player',${player.externalId},tc.local_id,
          jsonb_build_object('identity_source','vdc_tc','tc_external_id',${tcId}),
          now()
        FROM integration_entity_links tc
        WHERE tc.integration_key='vdc_tc'
          AND tc.entity_type='player'
          AND tc.external_id=${tcId}
        ON CONFLICT (integration_key,entity_type,external_id)
        DO UPDATE SET local_id=EXCLUDED.local_id,metadata=EXCLUDED.metadata,last_synced_at=now()
      `;
    }

    await sql`
      UPDATE integration_connections
      SET status='connected',last_sync_at=now(),last_error=NULL,updated_at=now()
      WHERE integration_key='vdc_turnier'
    `;

    await sql`
      INSERT INTO integration_sync_runs (integration_key,direction,status,summary)
      VALUES (
        'vdc_turnier','inbound','success',
        jsonb_build_object('tournaments',${tournaments.length},'players',${players.length})
      )
    `;

    return NextResponse.json({ ok: true, tournaments: tournaments.length, players: players.length });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown sync error";
    await sql`
      UPDATE integration_connections
      SET status='error',last_error=${message},updated_at=now()
      WHERE integration_key='vdc_turnier'
    `;
    await sql`
      INSERT INTO integration_sync_runs (integration_key,direction,status,error_text)
      VALUES ('vdc_turnier','inbound','error',${message})
    `;
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
