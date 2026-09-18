import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function StatisticsPage() {
  const actor = await requirePermission("statistics.read");
  const isAdmin = actor.roles.includes("admin");
  const sql = getDb();

  const [summaryRows, teams, integrations, activityRows, tournaments, trainings] = sql
    ? await Promise.all([
        sql`
          SELECT
            (SELECT count(*) FROM members WHERE status='active')::int AS members,
            (SELECT count(*) FROM teams WHERE status='active')::int AS teams,
            (SELECT count(*) FROM club_events
             WHERE source='vdc_turnier'
               AND EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Europe/Berlin')=EXTRACT(YEAR FROM CURRENT_DATE))::int AS tournaments,
            (SELECT count(*) FROM training_sessions
             WHERE status<>'cancelled'
               AND EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'Europe/Berlin')=EXTRACT(YEAR FROM CURRENT_DATE))::int AS trainings,
            (SELECT count(*) FROM club_events WHERE source='vdc_tc' AND event_type='league')::int AS league_matches
        `,
        sql`
          SELECT
            t.id::text,t.name,t.short_name,t.league,
            count(tm.member_id) FILTER (WHERE tm.is_active)::int AS players,
            count(tm.member_id) FILTER (WHERE tm.is_active AND tm.is_captain)::int AS captains
          FROM teams t
          LEFT JOIN team_members tm ON tm.team_id=t.id
          WHERE t.status='active'
          GROUP BY t.id
          ORDER BY CASE t.team_type WHEN 'first' THEN 0 WHEN 'second' THEN 1 ELSE 2 END,t.name
        `,
        isAdmin
          ? sql`
              SELECT
                i.integration_key,i.display_name,i.status,i.last_sync_at,
                count(l.id) FILTER (WHERE l.entity_type='player')::int AS linked_players,
                count(l.id) FILTER (WHERE l.entity_type IN ('match','tournament','training_day'))::int AS linked_activities
              FROM integration_connections i
              LEFT JOIN integration_entity_links l ON l.integration_key=i.integration_key
              GROUP BY i.integration_key,i.display_name,i.status,i.last_sync_at
              ORDER BY CASE i.integration_key WHEN 'vdc_tc' THEN 0 WHEN 'vdc_turnier' THEN 1 ELSE 2 END
            `
          : Promise.resolve([]),
        sql`
          SELECT event_type,count(*)::int AS count
          FROM club_events
          WHERE EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Europe/Berlin')=EXTRACT(YEAR FROM CURRENT_DATE)
          GROUP BY event_type
          ORDER BY count(*) DESC,event_type
        `,
        sql`
          SELECT
            e.title,e.starts_at,
            l.metadata->>'status' AS status,
            l.metadata->>'format' AS format,
            COALESCE((l.metadata->>'participants')::int,0) AS participants
          FROM integration_entity_links l
          JOIN club_events e ON e.id=l.local_id
          WHERE l.integration_key='vdc_turnier' AND l.entity_type='tournament'
          ORDER BY e.starts_at DESC
          LIMIT 8
        `,
        sql`
          SELECT
            s.scheduled_at AS starts_at,
            s.status,
            s.attendance_recorded_at,
            count(a.member_id) FILTER (WHERE a.attendance='present')::int AS players,
            string_agg(
              CASE WHEN a.attendance='present' THEN m.first_name || ' ' || m.last_name END,
              ', ' ORDER BY m.last_name,m.first_name
            ) FILTER (WHERE a.attendance='present') AS present_names
          FROM training_sessions s
          LEFT JOIN training_attendance a ON a.session_id=s.id
          LEFT JOIN members m ON m.id=a.member_id
          WHERE s.scheduled_at < now()
          GROUP BY s.id
          ORDER BY s.scheduled_at DESC
          LIMIT 12
        `,
      ])
    : [[{ members:0,teams:0,tournaments:0,trainings:0,league_matches:0 }],[],[],[],[],[]];

  const summary = summaryRows[0] ?? {};
  const members = Number(summary.members ?? 0);
  const maxActivity = Math.max(1,...activityRows.map((row) => Number(row.count ?? 0)));

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Auswertung</span>
          <h1>Vereinsstatistik</h1>
          <p>Vereinsweite Auswertung zu Kadern, Spielbetrieb, Turnieren und Training.</p>
        </div>
      </section>

      <section className="stat-grid">
        <article className="stat-card"><span>Mitglieder</span><strong>{members}</strong><small>aktive Club-Stammdaten</small></article>
        <article className="stat-card"><span>Mannschaften</span><strong>{Number(summary.teams ?? 0)}</strong><small>Ligabetrieb</small></article>
        <article className="stat-card"><span>Turniere</span><strong>{Number(summary.tournaments ?? 0)}</strong><small>im aktuellen Jahr</small></article>
        <article className="stat-card"><span>Trainingstage</span><strong>{Number(summary.trainings ?? 0)}</strong><small>im aktuellen Jahr</small></article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Mannschaften</span><h2>Kaderstruktur</h2></div></div>
          <div className="team-stat-list">
            {teams.map((team) => (
              <div className="team-stat-row" key={String(team.id)}>
                <div>
                  <strong>{team.short_name ? String(team.short_name) : String(team.name)}</strong>
                  <span>{team.league ? String(team.league) : "Keine Liga"}</span>
                </div>
                <div><span>Spieler</span><strong>{Number(team.players)}</strong></div>
                <div><span>Captains</span><strong>{Number(team.captains)}</strong></div>
              </div>
            ))}
          </div>
        </article>

        {isAdmin && (
          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Integrationen</span><h2>Datenabdeckung Mitglieder</h2></div></div>
            <div className="coverage-list">
              {integrations.map((integration) => {
                const linked = Number(integration.linked_players ?? 0);
                const coverage = pct(linked,members);
                return (
                  <div className="coverage-row" key={String(integration.integration_key)}>
                    <div className="coverage-head">
                      <div>
                        <strong>{String(integration.display_name)}</strong>
                        <span>{linked} von {members} Mitgliedern verknüpft</span>
                      </div>
                      <b>{coverage}%</b>
                    </div>
                    <div className="coverage-track"><span style={{ width: `${coverage}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </article>
        )}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Aktivität</span><h2>Termine nach Typ</h2></div></div>
          <div className="activity-bars">
            {activityRows.length === 0 ? <div className="empty-state">Noch keine Aktivitäten vorhanden.</div> : activityRows.map((row) => {
              const value=Number(row.count ?? 0);
              const width=Math.max(4,Math.round((value/maxActivity)*100));
              return (
                <div className="activity-bar-row" key={String(row.event_type)}>
                  <span>{String(row.event_type)}</span>
                  <div><i style={{ width: `${width}%` }} /></div>
                  <strong>{value}</strong>
                </div>
              );
            })}
          </div>
          <div className="statistics-footnote">Ligaspiele im Club-Kalender: <strong>{Number(summary.league_matches ?? 0)}</strong></div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Turnier</span><h2>Interne Turniere</h2></div></div>
          <div className="compact-activity-list">
            {tournaments.length === 0 ? <div className="empty-state">Noch keine Turniere synchronisiert.</div> : tournaments.map((tournament) => (
              <div key={String(tournament.title)+String(tournament.starts_at)}>
                <div><strong>{String(tournament.title)}</strong><span>{formatDate(tournament.starts_at)} · {tournament.format ? String(tournament.format) : "Format offen"}</span></div>
                <b>{Number(tournament.participants)} TN</b>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel-head"><div><span className="eyebrow">Training</span><h2>Letzte Trainingstage</h2></div><span className="count-chip">{trainings.length}</span></div>
        <div className="training-stat-grid">
          {trainings.length === 0 ? <div className="empty-state">Noch keine Trainingstage synchronisiert.</div> : trainings.map((training,index) => (
            <div key={String(training.starts_at)+index}>
              <span>{formatDate(training.starts_at)}</span>
              <strong>
                {training.attendance_recorded_at
                  ? `${Number(training.players)} anwesend`
                  : training.status==="cancelled"
                    ? "Abgesagt"
                    : "Anwesenheit offen"}
              </strong>
              <small>
                {training.present_names
                  ? String(training.present_names)
                  : training.attendance_recorded_at
                    ? "Keine Anwesenheit"
                    : "Noch nicht erfasst"}
              </small>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
