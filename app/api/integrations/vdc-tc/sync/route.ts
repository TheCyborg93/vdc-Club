import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { bearerToken, secureSecretEqual } from "@/lib/integration-token";

export const runtime = "nodejs";

type TeamPayload = {
  externalId: string;
  name: string;
  shortName?: string | null;
  league?: string | null;
  season?: string | null;
  venue?: string | null;
  teamType?: string | null;
};

type PlayerPayload = {
  externalId: string;
  name: string;
  teamExternalId?: string | null;
  active?: boolean;
};

type OpponentTeamPayload = {
  externalId: string;
  name: string;
  league?: string | null;
  season?: string | null;
  venue?: string | null;
  active?: boolean;
};

type OpponentPlayerPayload = {
  externalId: string;
  name: string;
  opponentTeamExternalId: string;
  active?: boolean;
  currentStats?: unknown;
  historicalStats?: unknown[];
  updatedAt?: string | null;
};

type MatchPayload = {
  externalId: string;
  title: string;
  startsAt: string;
  eventType?: "league" | "tournament";
  teamExternalId: string;
  description?: string | null;
  location?: string | null;
};

type SyncPayload = {
  source?: string;
  teams?: TeamPayload[];
  players?: PlayerPayload[];
  opponentTeams?: OpponentTeamPayload[];
  opponentPlayers?: OpponentPlayerPayload[];
  matches?: MatchPayload[];
};

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? fullName, lastName: "" };
  const lastName = parts.pop()!;
  return { firstName: parts.join(" "), lastName };
}

export async function POST(request: Request) {
  const expected = process.env.VDC_TC_SYNC_TOKEN;
  const provided = bearerToken(request);

  if (!expected) {
    return NextResponse.json({ error: "TC sync token is not configured." }, { status: 503 });
  }
  if (!provided || !secureSecretEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  let payload: SyncPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (payload.source && payload.source !== "vdc_tc") {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }

  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const players = Array.isArray(payload.players) ? payload.players : [];
  const opponentTeams = Array.isArray(payload.opponentTeams) ? payload.opponentTeams : [];
  const opponentPlayers = Array.isArray(payload.opponentPlayers) ? payload.opponentPlayers : [];
  const matches = Array.isArray(payload.matches) ? payload.matches : [];

  try {
    for (const team of teams) {
      if (!team.externalId || !team.name) continue;

      const rows = await sql`
        INSERT INTO teams (
          name, short_name, league, season, venue, team_type,
          status, external_source, external_id
        )
        VALUES (
          ${team.name},
          ${team.shortName ?? null},
          ${team.league ?? null},
          ${team.season ?? null},
          ${team.venue ?? null},
          ${team.teamType ?? null},
          'active',
          'vdc_tc',
          ${team.externalId}
        )
        ON CONFLICT (external_source,external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          name=EXCLUDED.name,
          short_name=EXCLUDED.short_name,
          league=EXCLUDED.league,
          season=EXCLUDED.season,
          venue=EXCLUDED.venue,
          team_type=EXCLUDED.team_type,
          status='active',
          updated_at=now()
        RETURNING id::text
      `;

      let localId = rows[0]?.id ? String(rows[0].id) : "";
      if (!localId) {
        const existing = await sql`
          SELECT id::text
          FROM teams
          WHERE external_source = 'vdc_tc'
            AND external_id = ${team.externalId}
          LIMIT 1
        `;
        localId = existing[0]?.id ? String(existing[0].id) : "";
        if (localId) {
          await sql`
            UPDATE teams
            SET
              name = ${team.name},
              short_name = ${team.shortName ?? null},
              league = ${team.league ?? null},
              season = ${team.season ?? null},
              venue = ${team.venue ?? null},
              team_type = ${team.teamType ?? null},
              status = 'active'
            WHERE id = ${localId}::uuid
          `;
        }
      }

      if (localId) {
        await sql`
          INSERT INTO integration_entity_links (
            integration_key, entity_type, external_id, local_id, metadata, last_synced_at
          )
          VALUES (
            'vdc_tc', 'team', ${team.externalId}, ${localId}::uuid,
            jsonb_build_object('league',${team.league ?? null}::text,'season',${team.season ?? null}::text),
            now()
          )
          ON CONFLICT (integration_key,entity_type,external_id)
          DO UPDATE SET
            local_id = EXCLUDED.local_id,
            metadata = EXCLUDED.metadata,
            last_synced_at = now()
        `;
      }
    }

    for (const player of players) {
      if (!player.externalId || !player.name) continue;
      const { firstName, lastName } = splitName(player.name);

      const memberRows = await sql`
        WITH linked AS (
          SELECT local_id AS id
          FROM integration_entity_links
          WHERE integration_key = 'vdc_tc'
            AND entity_type = 'player'
            AND external_id = ${player.externalId}
          LIMIT 1
        ),
        named AS (
          SELECT id
          FROM members
          WHERE lower(first_name) = lower(${firstName})
            AND lower(last_name) = lower(${lastName})
          LIMIT 1
        ),
        inserted AS (
          INSERT INTO members (first_name,last_name,status)
          SELECT ${firstName}, ${lastName}, 'active'
          WHERE NOT EXISTS (SELECT 1 FROM linked)
            AND NOT EXISTS (SELECT 1 FROM named)
          RETURNING id
        )
        SELECT id::text FROM linked
        UNION ALL SELECT id::text FROM named WHERE NOT EXISTS (SELECT 1 FROM linked)
        UNION ALL SELECT id::text FROM inserted
        LIMIT 1
      `;

      const memberId = memberRows[0]?.id ? String(memberRows[0].id) : "";
      if (!memberId) continue;

      await sql`
        UPDATE members
        SET status = ${player.active === false ? "inactive" : "active"}
        WHERE id = ${memberId}::uuid
      `;

      await sql`
        INSERT INTO integration_entity_links (
          integration_key,entity_type,external_id,local_id,metadata,last_synced_at
        )
        VALUES (
          'vdc_tc','player',${player.externalId},${memberId}::uuid,
          jsonb_build_object('team_external_id',${player.teamExternalId ?? null}::text),
          now()
        )
        ON CONFLICT (integration_key,entity_type,external_id)
        DO UPDATE SET
          local_id = EXCLUDED.local_id,
          metadata = EXCLUDED.metadata,
          last_synced_at = now()
      `;

      if (player.teamExternalId) {
        const teamRows = await sql`
          SELECT id::text
          FROM teams
          WHERE external_source='vdc_tc'
            AND external_id=${player.teamExternalId}
          LIMIT 1
        `;
        const teamId = teamRows[0]?.id ? String(teamRows[0].id) : "";
        if (teamId) {
          await sql`
            INSERT INTO team_members (team_id,member_id,is_captain,is_active)
            VALUES (${teamId}::uuid,${memberId}::uuid,false,${player.active !== false})
            ON CONFLICT (team_id,member_id)
            DO UPDATE SET is_active = EXCLUDED.is_active
          `;
        }
      }
    }

    for (const team of opponentTeams) {
      if (!team.externalId || !team.name) continue;

      const rows = await sql`
        INSERT INTO tc_opponent_teams (
          external_source, external_id, name, league, season, venue, is_active
        )
        VALUES (
          'vdc_tc', ${team.externalId}, ${team.name}, ${team.league ?? null},
          ${team.season ?? null}, ${team.venue ?? null}, ${team.active !== false}
        )
        ON CONFLICT (external_source, external_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          league = EXCLUDED.league,
          season = EXCLUDED.season,
          venue = EXCLUDED.venue,
          is_active = EXCLUDED.is_active,
          updated_at = now()
        RETURNING id::text
      `;

      const localId = rows[0]?.id ? String(rows[0].id) : "";
      if (localId) {
        await sql`
          INSERT INTO integration_entity_links (
            integration_key, entity_type, external_id, local_id, metadata, last_synced_at
          )
          VALUES (
            'vdc_tc', 'opponent_team', ${team.externalId}, ${localId}::uuid,
            jsonb_build_object('season', ${team.season ?? null}::text), now()
          )
          ON CONFLICT (integration_key, entity_type, external_id)
          DO UPDATE SET
            local_id = EXCLUDED.local_id,
            metadata = EXCLUDED.metadata,
            last_synced_at = now()
        `;
      }
    }

    for (const player of opponentPlayers) {
      if (!player.externalId || !player.name || !player.opponentTeamExternalId) continue;

      const teamRows = await sql`
        SELECT id::text
        FROM tc_opponent_teams
        WHERE external_source = 'vdc_tc'
          AND external_id = ${player.opponentTeamExternalId}
        LIMIT 1
      `;
      const opponentTeamId = teamRows[0]?.id ? String(teamRows[0].id) : "";
      if (!opponentTeamId) continue;

      const currentStats = JSON.stringify(player.currentStats ?? null);
      const historicalStats = JSON.stringify(
        Array.isArray(player.historicalStats) ? player.historicalStats : [],
      );

      const rows = await sql`
        INSERT INTO tc_opponent_players (
          opponent_team_id, external_source, external_id, name, is_active,
          current_stats, historical_stats, source_updated_at
        )
        VALUES (
          ${opponentTeamId}::uuid, 'vdc_tc', ${player.externalId}, ${player.name},
          ${player.active !== false}, ${currentStats}::jsonb, ${historicalStats}::jsonb,
          ${player.updatedAt ?? null}::timestamptz
        )
        ON CONFLICT (external_source, external_id)
        DO UPDATE SET
          opponent_team_id = EXCLUDED.opponent_team_id,
          name = EXCLUDED.name,
          is_active = EXCLUDED.is_active,
          current_stats = EXCLUDED.current_stats,
          historical_stats = EXCLUDED.historical_stats,
          source_updated_at = EXCLUDED.source_updated_at,
          updated_at = now()
        RETURNING id::text
      `;

      const localId = rows[0]?.id ? String(rows[0].id) : "";
      if (localId) {
        await sql`
          INSERT INTO integration_entity_links (
            integration_key, entity_type, external_id, local_id, metadata, last_synced_at
          )
          VALUES (
            'vdc_tc', 'opponent_player', ${player.externalId}, ${localId}::uuid,
            jsonb_build_object('opponent_team_external_id', ${player.opponentTeamExternalId}::text), now()
          )
          ON CONFLICT (integration_key, entity_type, external_id)
          DO UPDATE SET
            local_id = EXCLUDED.local_id,
            metadata = EXCLUDED.metadata,
            last_synced_at = now()
        `;
      }
    }

    for (const match of matches) {
      if (!match.externalId || !match.title || !match.startsAt || !match.teamExternalId) continue;
      const teamRows = await sql`
        SELECT id::text
        FROM teams
        WHERE external_source='vdc_tc'
          AND external_id=${match.teamExternalId}
        LIMIT 1
      `;
      const teamId = teamRows[0]?.id ? String(teamRows[0].id) : "";
      if (!teamId) continue;

      const eventRows = await sql`
        INSERT INTO club_events (
          title,event_type,starts_at,location,source,external_id,team_id,description
        )
        VALUES (
          ${match.title},
          ${match.eventType === "tournament" ? "tournament" : "league"},
          ${match.startsAt}::timestamptz,
          ${match.location ?? null},
          'vdc_tc',
          ${match.externalId},
          ${teamId}::uuid,
          ${match.description ?? null}
        )
        ON CONFLICT (source,external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          title=EXCLUDED.title,
          event_type=EXCLUDED.event_type,
          starts_at=EXCLUDED.starts_at,
          location=EXCLUDED.location,
          team_id=EXCLUDED.team_id,
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
          VALUES ('vdc_tc','match',${match.externalId},${eventId}::uuid,'{}'::jsonb,now())
          ON CONFLICT (integration_key,entity_type,external_id)
          DO UPDATE SET local_id=EXCLUDED.local_id,last_synced_at=now()
        `;
      }
    }

    await sql`
      UPDATE integration_connections
      SET status='connected',last_sync_at=now(),last_error=NULL,updated_at=now()
      WHERE integration_key='vdc_tc'
    `;
    await sql`
      INSERT INTO integration_sync_runs (integration_key,direction,status,summary)
      VALUES (
        'vdc_tc','inbound','success',
        jsonb_build_object(
          'teams',${teams.length}::int,
          'players',${players.length}::int,
          'opponentTeams',${opponentTeams.length}::int,
          'opponentPlayers',${opponentPlayers.length}::int,
          'matches',${matches.length}::int
        )
      )
    `;

    return NextResponse.json({
      ok: true,
      teams: teams.length,
      players: players.length,
      opponentTeams: opponentTeams.length,
      opponentPlayers: opponentPlayers.length,
      matches: matches.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown sync error";
    await sql`
      UPDATE integration_connections
      SET status='error',last_error=${message},updated_at=now()
      WHERE integration_key='vdc_tc'
    `;
    await sql`
      INSERT INTO integration_sync_runs (integration_key,direction,status,error_text)
      VALUES ('vdc_tc','inbound','error',${message})
    `;
    return NextResponse.json({ error: "Sync failed." }, { status: 500 });
  }
}
