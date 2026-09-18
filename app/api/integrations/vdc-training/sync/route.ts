import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { bearerToken, secureSecretEqual } from "@/lib/integration-token";

export const runtime = "nodejs";

type TrainingDayPayload = {
  externalId: string | number;
  startsAt: string;
  status?: string | null;
  players?: number;
};

type PlayerPayload = {
  externalId: string | number;
  fullName: string;
  displayName?: string | null;
};

type SyncPayload = {
  source?: string;
  trainingDays?: TrainingDayPayload[];
  players?: PlayerPayload[];
};

export async function POST(request: Request) {
  const expected = process.env.VDC_TRAINING_SYNC_TOKEN;
  const provided = bearerToken(request);

  if (!expected) return NextResponse.json({ error: "Training sync token is not configured." }, { status: 503 });
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

  if (payload.source && payload.source !== "vdc_training") {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }

  const days = Array.isArray(payload.trainingDays) ? payload.trainingDays : [];
  const players = Array.isArray(payload.players) ? payload.players : [];

  try {
    for (const day of days) {
      if (day.externalId === undefined || !day.startsAt) continue;
      const externalId = String(day.externalId);
      const playerCount = Number.isFinite(Number(day.players)) ? Math.max(0, Number(day.players)) : 0;
      const description = [
        day.status ? `Status ${day.status}` : null,
        `${playerCount} eingeplante Spieler`,
      ].filter(Boolean).join(" · ");

      const eventRows = await sql`
        INSERT INTO club_events (
          title,event_type,starts_at,source,external_id,description
        )
        VALUES (
          'Vereinstraining','training',
          ${day.startsAt}::timestamptz,
          'vdc_training',
          ${externalId},
          ${description}
        )
        ON CONFLICT (source,external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          starts_at=EXCLUDED.starts_at,
          description=EXCLUDED.description,
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
            'vdc_training','training_day',${externalId},${eventId}::uuid,
            jsonb_build_object('status',${day.status ?? null},'players',${playerCount}),
            now()
          )
          ON CONFLICT (integration_key,entity_type,external_id)
          DO UPDATE SET local_id=EXCLUDED.local_id,metadata=EXCLUDED.metadata,last_synced_at=now()
        `;
      }
    }

    for (const player of players) {
      if (player.externalId === undefined || !player.fullName.trim()) continue;
      const externalId = String(player.externalId);
      const fullName = player.fullName.trim();

      await sql`
        INSERT INTO integration_entity_links (
          integration_key,entity_type,external_id,local_id,metadata,last_synced_at
        )
        SELECT
          'vdc_training','player',${externalId},m.id,
          jsonb_build_object(
            'display_name',${player.displayName ?? null},
            'source_name',${fullName}
          ),
          now()
        FROM members m
        WHERE lower(trim(m.first_name || ' ' || m.last_name))=lower(${fullName})
        ON CONFLICT (integration_key,entity_type,external_id)
        DO UPDATE SET local_id=EXCLUDED.local_id,metadata=EXCLUDED.metadata,last_synced_at=now()
      `;
    }

    await sql`
      UPDATE integration_connections
      SET status='connected',last_sync_at=now(),last_error=NULL,updated_at=now()
      WHERE integration_key='vdc_training'
    `;

    await sql`
      INSERT INTO integration_sync_runs (integration_key,direction,status,summary)
      VALUES (
        'vdc_training','inbound','success',
        jsonb_build_object('training_days',${days.length},'players',${players.length})
      )
    `;

    return NextResponse.json({ ok: true, trainingDays: days.length, players: players.length });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown sync error";
    await sql`
      UPDATE integration_connections
      SET status='error',last_error=${message},updated_at=now()
      WHERE integration_key='vdc_training'
    `;
    await sql`
      INSERT INTO integration_sync_runs (integration_key,direction,status,error_text)
      VALUES ('vdc_training','inbound','error',${message})
    `;
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
