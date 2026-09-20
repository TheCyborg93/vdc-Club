import "server-only";
import { getDb } from "@/lib/db";

type IntegrationKey = "vdc_tc" | "vdc_turnier" | "vdc_training";

type SyncResult = {
  key: IntegrationKey;
  ok: boolean;
  status: number;
  summary: Record<string, unknown>;
  error?: string;
};

const sourceUrls: Record<IntegrationKey,string> = {
  vdc_tc: process.env.VDC_TC_SOURCE_URL || "https://vdc-tc.vercel.app/api/integrations/vdc-club",
  vdc_turnier: process.env.VDC_TURNIER_SOURCE_URL || "https://vdc-turnier.vercel.app/api/integrations/vdc-club",
  vdc_training: process.env.VDC_TRAINING_SOURCE_URL || "https://vdc-training-app.vercel.app/api/integrations/vdc-club",
};

const targetPaths: Record<IntegrationKey,string> = {
  vdc_tc: "/api/integrations/vdc-tc/sync",
  vdc_turnier: "/api/integrations/vdc-turnier/sync",
  vdc_training: "/api/integrations/vdc-training/sync",
};

function tokenFor(key: IntegrationKey) {
  if (key === "vdc_tc") return process.env.VDC_TC_SYNC_TOKEN || "";
  if (key === "vdc_turnier") return process.env.VDC_TURNIER_SYNC_TOKEN || "";
  return process.env.VDC_TRAINING_SYNC_TOKEN || "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

function clubBaseUrl() {
  const configured = process.env.VDC_CLUB_INTERNAL_URL?.trim();
  if (configured) return configured.replace(/\/$/,"");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return production.startsWith("http") ? production.replace(/\/$/,"") : `https://${production.replace(/\/$/,"")}`;
  }

  return "https://vdc-club.vercel.app";
}

async function readSource(key: IntegrationKey) {
  const token = tokenFor(key);
  if (!token) throw new Error(`${key}: Sync-Token fehlt.`);

  const response = await fetch(sourceUrls[key], {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`${key}: Quelle antwortet mit HTTP ${response.status}.`);
  }

  const payload = await response.json() as unknown;
  const data = asRecord(payload);
  if (data.ok === false) throw new Error(`${key}: Quelle meldet einen Fehler.`);
  return data;
}

function normalizeTc(data: Record<string, unknown>) {
  const season = asRecord(data.activeSeason);
  const teams = asArray(data.teams);
  const matches = asArray(data.matches);
  const players = asArray(data.players);

  return {
    source: "vdc_tc",
    teams: teams.map((team) => {
      const league = asRecord(team.league);
      return {
        externalId: text(team.id),
        name: text(team.name) || "VDC",
        shortName: null,
        league: text(league.name) || null,
        season: text(season.name) || null,
        venue: text(team.venue) || null,
        teamType: text(team.teamType) || null,
      };
    }).filter((team) => team.externalId),
    players: players.map((player) => ({
      externalId: text(player.id),
      name: text(player.name) || "Spieler",
      teamExternalId: text(player.currentTeamId) || text(player.baseTeamId) || null,
      active: true,
    })).filter((player) => player.externalId),
    matches: matches.map((match) => {
      const home = asRecord(match.home);
      const away = asRecord(match.away);
      const ownTeam = home.isOwn === true ? home : away.isOwn === true ? away : {};
      const title = [text(home.name) || "Heim", text(away.name) || "Gast"].join(" – ");
      const description = [
        text(match.competition) || null,
        match.matchday != null ? `Spieltag ${text(match.matchday)}` : null,
        text(match.status) ? `Status ${text(match.status)}` : null,
        text(match.result) ? `Ergebnis ${text(match.result)}` : null,
      ].filter(Boolean).join(" · ");

      return {
        externalId: text(match.id),
        title,
        startsAt: text(match.startsAt),
        eventType: "league",
        teamExternalId: text(ownTeam.id),
        description: description || null,
        location: text(home.venue) || null,
      };
    }).filter((match) => match.externalId && match.startsAt && match.teamExternalId),
  };
}

function normalizeTournament(data: Record<string, unknown>) {
  const tournaments = asArray(data.tournaments);
  return {
    source: "vdc_turnier",
    tournaments: tournaments.map((tournament) => ({
      externalId: text(tournament.id),
      name: text(tournament.name) || "VDC Turnier",
      type: text(tournament.type) || null,
      status: text(tournament.status) || null,
      tournamentDate: text(tournament.date).slice(0,10),
      startTime: text(tournament.startTime) || "19:00",
      venue: text(tournament.venue) || null,
      format: text(tournament.format) || null,
      participants: Number(tournament.participantCount || 0),
    })).filter((tournament) => tournament.externalId && tournament.tournamentDate),
    players: [],
  };
}

function normalizeTraining(data: Record<string, unknown>) {
  const trainingDays = asArray(data.trainingDays);
  const statistics = asArray(data.playerStatistics);

  return {
    source: "vdc_training",
    players: statistics.map((player) => ({
      externalId: text(player.id),
      fullName: text(player.displayName),
      displayName: text(player.displayName),
    })).filter((player) => player.externalId && player.fullName),
    trainingDays: trainingDays.map((day) => {
      const players = asArray(day.players);
      return {
        externalId: text(day.id),
        startsAt: text(day.trainingDate),
        status: text(day.status),
        players: players.length,
      };
    }).filter((day) => day.externalId && day.startsAt),
  };
}

async function cleanupMissingFutureEvents(key: IntegrationKey, externalIds: string[]) {
  const sql=getDb();
  if (!sql) return;

  const source = key;
  const encoded=JSON.stringify(externalIds);

  await sql`
    UPDATE club_events
    SET
      deleted_at=now(),
      delete_reason='Automatisch entfernt: Termin ist in der Quell-App nicht mehr vorhanden.'
    WHERE source=${source}
      AND external_id IS NOT NULL
      AND deleted_at IS NULL
      AND starts_at >= now()
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${encoded}::jsonb) AS ids(value)
        WHERE ids.value=club_events.external_id
      )
  `;
}

function eventIdsFromPayload(key: IntegrationKey, payload: Record<string, unknown>) {
  const collection = key === "vdc_tc"
    ? asArray(payload.matches)
    : key === "vdc_turnier"
      ? asArray(payload.tournaments)
      : asArray(payload.trainingDays);

  return collection.map((item)=>text(item.externalId)).filter(Boolean);
}

async function pushToClub(key: IntegrationKey, payload: Record<string, unknown>): Promise<SyncResult> {
  const token = tokenFor(key);
  const response = await fetch(`${clubBaseUrl()}${targetPaths[key]}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  let body: Record<string, unknown> = {};
  try {
    body = asRecord(await response.json());
  } catch {
    body = {};
  }

  return {
    key,
    ok: response.ok && body.error == null,
    status: response.status,
    summary: body,
    error: response.ok ? undefined : text(body.error) || `HTTP ${response.status}`,
  };
}

export async function syncIntegration(key: IntegrationKey): Promise<SyncResult> {
  try {
    const source = await readSource(key);
    const normalized = key === "vdc_tc"
      ? normalizeTc(source)
      : key === "vdc_turnier"
        ? normalizeTournament(source)
        : normalizeTraining(source);

    const payload=normalized as Record<string, unknown>;
    const result=await pushToClub(key,payload);
    if (result.ok) {
      await cleanupMissingFutureEvents(key,eventIdsFromPayload(key,payload));
    }
    return result;
  } catch (error) {
    return {
      key,
      ok: false,
      status: 500,
      summary: {},
      error: error instanceof Error ? error.message : "Unbekannter Sync-Fehler",
    };
  }
}

export async function syncAllIntegrations() {
  const results: SyncResult[] = [];

  // TC zuerst, damit Mitglieder- und Mannschaftsbezüge für die Fachmodule bereits existieren.
  results.push(await syncIntegration("vdc_tc"));
  results.push(await syncIntegration("vdc_turnier"));
  results.push(await syncIntegration("vdc_training"));

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}

export async function ensureIntegrationsFresh(maxAgeMinutes = 5) {
  const sql = getDb();
  if (!sql) return { ok:false, skipped:true, reason:"database" };

  const rows = await sql`
    SELECT
      integration_key,
      status,
      last_sync_at,
      EXTRACT(EPOCH FROM (now() - COALESCE(last_sync_at,to_timestamp(0)))) / 60 AS age_minutes
    FROM integration_connections
    WHERE integration_key IN ('vdc_tc','vdc_turnier','vdc_training')
      AND status <> 'disabled'
  `;

  const stale = rows.some((row) => Number(row.age_minutes ?? 999999) >= maxAgeMinutes);
  if (!stale) return { ok:true, skipped:true, reason:"fresh" };

  const result = await syncAllIntegrations();
  return { ...result, skipped:false };
}

export type { IntegrationKey, SyncResult };
