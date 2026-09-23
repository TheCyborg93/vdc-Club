import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL?.trim();
const syncToken = process.env.VDC_TC_SYNC_TOKEN?.trim();
const sourceUrl = (process.env.VDC_TC_SOURCE_URL ||
  "https://vdc-tc.vercel.app/api/integrations/vdc-club").trim();

if (!databaseUrl || !syncToken) {
  console.log("TC opponent migration skipped: production environment is not available.");
  process.exit(0);
}

const response = await fetch(sourceUrl, {
  headers: { Authorization: `Bearer ${syncToken}` },
  cache: "no-store",
  signal: AbortSignal.timeout(20_000),
});

if (!response.ok) {
  throw new Error(`TC opponent migration source returned HTTP ${response.status}.`);
}

const payload = await response.json();
const opponentTeams = Array.isArray(payload.opponentTeams) ? payload.opponentTeams : [];
const opponentPlayers = Array.isArray(payload.opponentPlayers) ? payload.opponentPlayers : [];
const activeSeason = payload.activeSeason && typeof payload.activeSeason === "object"
  ? payload.activeSeason
  : {};

const sql = neon(databaseUrl);

await sql`
  CREATE TABLE IF NOT EXISTS tc_opponent_teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_source text NOT NULL DEFAULT 'vdc_tc',
    external_id text NOT NULL,
    name text NOT NULL,
    league text,
    season text,
    venue text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (external_source, external_id)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS tc_opponent_players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    opponent_team_id uuid NOT NULL REFERENCES tc_opponent_teams(id) ON DELETE CASCADE,
    external_source text NOT NULL DEFAULT 'vdc_tc',
    external_id text NOT NULL,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    current_stats jsonb,
    historical_stats jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (external_source, external_id),
    UNIQUE (opponent_team_id, name)
  )
`;

await sql`CREATE INDEX IF NOT EXISTS idx_tc_opponent_teams_name ON tc_opponent_teams(lower(name))`;
await sql`CREATE INDEX IF NOT EXISTS idx_tc_opponent_players_team_active ON tc_opponent_players(opponent_team_id, is_active, name)`;

for (const team of opponentTeams) {
  const externalId = String(team?.id ?? "").trim();
  const name = String(team?.name ?? "").trim();
  if (!externalId || !name) continue;

  const league = team?.league && typeof team.league === "object"
    ? String(team.league.name ?? "").trim() || null
    : null;

  await sql`
    INSERT INTO tc_opponent_teams (
      external_source, external_id, name, league, season, venue, is_active
    )
    VALUES (
      'vdc_tc', ${externalId}, ${name}, ${league},
      ${String(activeSeason.name ?? "").trim() || null},
      ${String(team?.venue ?? "").trim() || null},
      ${team?.active !== false}
    )
    ON CONFLICT (external_source, external_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      league = EXCLUDED.league,
      season = EXCLUDED.season,
      venue = EXCLUDED.venue,
      is_active = EXCLUDED.is_active,
      updated_at = now()
  `;
}

let importedPlayers = 0;
for (const player of opponentPlayers) {
  const externalId = String(player?.id ?? "").trim();
  const name = String(player?.name ?? "").trim();
  const teamExternalId = String(player?.teamId ?? "").trim();
  if (!externalId || !name || !teamExternalId) continue;

  const teamRows = await sql`
    SELECT id::text
    FROM tc_opponent_teams
    WHERE external_source = 'vdc_tc' AND external_id = ${teamExternalId}
    LIMIT 1
  `;
  const teamId = teamRows[0]?.id ? String(teamRows[0].id) : "";
  if (!teamId) continue;

  const currentStats = JSON.stringify(player.stats ?? null);
  const historicalStats = JSON.stringify(
    Array.isArray(player.historicalStats) ? player.historicalStats : [],
  );

  await sql`
    INSERT INTO tc_opponent_players (
      opponent_team_id, external_source, external_id, name, is_active,
      current_stats, historical_stats, source_updated_at
    )
    VALUES (
      ${teamId}::uuid, 'vdc_tc', ${externalId}, ${name}, ${player?.active !== false},
      ${currentStats}::jsonb, ${historicalStats}::jsonb,
      ${player?.updatedAt ?? null}::timestamptz
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
  `;
  importedPlayers += 1;
}

await sql`
  UPDATE integration_connections
  SET status = 'disabled', last_sync_at = now(), last_error = NULL, updated_at = now()
  WHERE integration_key = 'vdc_tc'
`;

await sql`
  INSERT INTO integration_sync_runs (integration_key, direction, status, summary)
  VALUES (
    'vdc_tc', 'inbound', 'success',
    jsonb_build_object(
      'migration', 'tc_opponent_rosters',
      'opponentTeams', ${opponentTeams.length}::int,
      'opponentPlayers', ${importedPlayers}::int,
      'sourceVersion', ${Number(payload.version ?? 0)}::int
    )
  )
`;

console.log(
  `TC opponent migration complete: ${opponentTeams.length} teams, ${importedPlayers} players. TC sync disabled.`,
);
