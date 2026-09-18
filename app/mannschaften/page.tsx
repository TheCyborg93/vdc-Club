import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { createTeamAction } from "@/app/mannschaften/actions";

export const dynamic = "force-dynamic";

function formatDateTime(value: unknown) {
  if (!value) return "Kein Termin";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Kein Termin";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requirePermission("teams.read");
  const sql = getDb();
  const params = await searchParams;
  const canWrite = hasPermission(actor.roles, "teams.write");
  const isAdmin = actor.roles.includes("admin");

  const [teams, counts] = sql
    ? await Promise.all([
        sql`
          SELECT
            t.id::text,
            t.name,
            t.short_name,
            t.league,
            t.season,
            t.status,
            t.venue,
            t.team_type,
            t.external_source,
            count(DISTINCT tm.member_id) FILTER (WHERE tm.is_active = true)::int AS roster_count,
            COALESCE(
              string_agg(
                DISTINCT CASE WHEN tm.is_captain AND tm.is_active THEN m.first_name || ' ' || m.last_name END,
                ', '
              ) FILTER (WHERE tm.is_captain AND tm.is_active),
              ''
            ) AS captains,
            next_event.starts_at AS next_match_at,
            next_event.title AS next_match_title
          FROM teams t
          LEFT JOIN team_members tm ON tm.team_id = t.id
          LEFT JOIN members m ON m.id = tm.member_id
          LEFT JOIN LATERAL (
            SELECT e.starts_at, e.title
            FROM club_events e
            WHERE e.team_id = t.id
              AND e.starts_at >= now()
            ORDER BY e.starts_at
            LIMIT 1
          ) next_event ON true
          GROUP BY t.id, next_event.starts_at, next_event.title
          ORDER BY
            CASE t.team_type WHEN 'first' THEN 0 WHEN 'second' THEN 1 ELSE 2 END,
            t.name
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status = 'active')::int AS teams,
            (SELECT count(DISTINCT member_id)::int FROM team_members WHERE is_active = true) AS players,
            (SELECT count(DISTINCT member_id)::int FROM team_members WHERE is_active = true AND is_captain = true) AS captains,
            (SELECT count(*)::int FROM club_events
             WHERE team_id IS NOT NULL
               AND starts_at >= now()
               AND starts_at < now() + interval '14 days') AS next_matches
          FROM teams
        `,
      ])
    : [[], [{ teams:0,players:0,captains:0,next_matches:0 }]];

  const c = counts[0] ?? {};

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Verein</span>
          <h1>Mannschaften</h1>
          <p>Kader, Captains, Liga, Saison und kommende Spieltage zentral verwalten.</p>
        </div>
      </section>

      {params.error && <div className="form-error">Die Mannschaft konnte nicht verarbeitet werden.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Mannschaften</span><strong>{Number(c.teams ?? 0)}</strong><small>aktiv</small></article>
        <article className="stat-card"><span>Spieler</span><strong>{Number(c.players ?? 0)}</strong><small>zugewiesen</small></article>
        <article className="stat-card"><span>Team Captains</span><strong>{Number(c.captains ?? 0)}</strong><small>markiert</small></article>
        <article className="stat-card"><span>Nächste Spiele</span><strong>{Number(c.next_matches ?? 0)}</strong><small>kommende 14 Tage</small></article>
      </section>

      <section className={canWrite ? "management-grid" : "management-grid single"}>
        <div className="team-management-list">
          {teams.length === 0 ? (
            <article className="panel"><div className="empty-state">Noch keine Mannschaften vorhanden.</div></article>
          ) : teams.map((team) => (
            <Link href={`/mannschaften/${team.id}`} className="team-overview-card" key={String(team.id)}>
              <div className="team-overview-head">
                <div className="team-badge">{team.short_name ? String(team.short_name) : "VDC"}</div>
                <div>
                  <span className="eyebrow">{team.season ? `Saison ${team.season}` : "Mannschaft"}</span>
                  <h2>{String(team.name)}</h2>
                  <p>{team.league ? String(team.league) : "Noch keiner Liga zugeordnet"}</p>
                </div>
                <div className="team-source-stack">
                  <b className={`status-badge status-${team.status}`}>{String(team.status)}</b>
                  {isAdmin && team.external_source === "vdc_tc" && <span className="sync-chip">TC verbunden</span>}
                </div>
              </div>

              <div className="team-overview-grid">
                <div><span>Kader</span><strong>{Number(team.roster_count)}</strong></div>
                <div><span>Captain</span><strong>{team.captains ? String(team.captains) : "Noch offen"}</strong></div>
                <div><span>Spielstätte</span><strong>{team.venue ? String(team.venue) : "Noch offen"}</strong></div>
              </div>

              <div className="team-next-match">
                <span>Nächstes Spiel</span>
                <strong>{team.next_match_title ? String(team.next_match_title) : "Kein kommender Termin"}</strong>
                <small>{formatDateTime(team.next_match_at)}</small>
              </div>
            </Link>
          ))}
        </div>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head"><div><span className="eyebrow">Neu</span><h2>Mannschaft anlegen</h2></div></div>
            <form action={createTeamAction} className="form-stack">
              <label>Name<input name="name" required /></label>
              <div className="form-grid">
                <label>Kurzname<input name="shortName" placeholder="VDC III" /></label>
                <label>Typ
                  <select name="teamType" defaultValue="">
                    <option value="">Keine Zuordnung</option>
                    <option value="first">1. Mannschaft</option>
                    <option value="second">2. Mannschaft</option>
                    <option value="other">Weitere Mannschaft</option>
                  </select>
                </label>
              </div>
              <label>Liga<input name="league" /></label>
              <label>Saison<input name="season" defaultValue="2026/27" /></label>
              <label>Spielstätte<input name="venue" /></label>
              <button className="primary-button">Mannschaft speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
