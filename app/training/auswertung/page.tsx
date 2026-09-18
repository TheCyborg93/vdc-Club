import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { PrintReportButton } from "@/components/print-report-button";

export const dynamic = "force-dynamic";

function pct(value: unknown) {
  return Math.max(0,Math.min(100,Number(value ?? 0)));
}

function formatDate(value: unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Europe/Berlin",
  }).format(date);
}

function monthLabel(value: unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    month:"long",year:"numeric",timeZone:"Europe/Berlin",
  }).format(date);
}

export default async function TrainingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requirePermission("training.read");
  const sql=getDb();
  const params=await searchParams;

  const nowYear=new Date().getFullYear();
  const requested=Number(params.year ?? nowYear);
  const selectedYear=Number.isInteger(requested) && requested>=2020 && requested<=nowYear+1
    ? requested
    : nowYear;

  const [yearRows,summaryRows,teams,monthly,teamMonthly,members]=sql
    ? await Promise.all([
        sql`
          SELECT DISTINCT EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'Europe/Berlin')::int AS year
          FROM training_sessions
          WHERE attendance_recorded_at IS NOT NULL
          UNION SELECT ${nowYear}::int
          ORDER BY year DESC
        `,
        sql`
          WITH per_session AS (
            SELECT
              s.id,
              s.scheduled_at,
              count(a.member_id) FILTER (WHERE a.attendance='present')::int AS present_count
            FROM training_sessions s
            LEFT JOIN training_attendance a ON a.session_id=s.id
            WHERE s.attendance_recorded_at IS NOT NULL
              AND s.status='completed'
              AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')=${selectedYear}
            GROUP BY s.id
          )
          SELECT
            count(*)::int AS trainings,
            COALESCE(round(avg(present_count),1),0) AS avg_present,
            COALESCE(max(present_count),0)::int AS max_present,
            COALESCE(sum(present_count),0)::int AS total_visits,
            COALESCE(round(avg(present_count) FILTER (
              WHERE EXTRACT(ISODOW FROM scheduled_at AT TIME ZONE 'Europe/Berlin')=2
            ),1),0) AS tuesday_avg,
            COALESCE(round(avg(present_count) FILTER (
              WHERE EXTRACT(ISODOW FROM scheduled_at AT TIME ZONE 'Europe/Berlin')=5
            ),1),0) AS friday_avg,
            (
              SELECT count(DISTINCT a2.member_id)::int
              FROM training_attendance a2
              JOIN training_sessions s2 ON s2.id=a2.session_id
              WHERE a2.attendance='present'
                AND s2.attendance_recorded_at IS NOT NULL
                AND s2.status='completed'
                AND EXTRACT(YEAR FROM s2.scheduled_at AT TIME ZONE 'Europe/Berlin')=${selectedYear}
            ) AS unique_members
          FROM per_session
        `,
        sql`
          WITH recorded AS (
            SELECT id,scheduled_at
            FROM training_sessions
            WHERE attendance_recorded_at IS NOT NULL
              AND status='completed'
              AND EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'Europe/Berlin')=${selectedYear}
          ),
          roster AS (
            SELECT
              t.id,
              t.name,
              t.short_name,
              t.league,
              t.season,
              count(tm.member_id)::int AS roster_count
            FROM teams t
            JOIN team_members tm ON tm.team_id=t.id AND tm.is_active=true
            WHERE t.status='active'
            GROUP BY t.id
          ),
          team_session AS (
            SELECT
              r.id AS team_id,
              r.name,
              r.short_name,
              r.league,
              r.season,
              r.roster_count,
              s.id AS session_id,
              count(a.member_id)::int AS tracked_count,
              count(a.member_id) FILTER (WHERE a.attendance='present')::int AS present_count,
              count(a.member_id) FILTER (WHERE a.attendance='excused')::int AS excused_count
            FROM roster r
            CROSS JOIN recorded s
            LEFT JOIN team_members tm
              ON tm.team_id=r.id
             AND tm.is_active=true
            LEFT JOIN training_attendance a
              ON a.session_id=s.id
             AND a.member_id=tm.member_id
            GROUP BY
              r.id,r.name,r.short_name,r.league,r.season,r.roster_count,s.id
          )
          SELECT
            team_id::text AS id,
            name,
            short_name,
            league,
            season,
            roster_count,
            count(session_id)::int AS trainings,
            COALESCE(round(avg(present_count),1),0) AS avg_present,
            COALESCE(sum(present_count),0)::int AS present_total,
            COALESCE(sum(excused_count),0)::int AS excused_total,
            CASE
              WHEN sum(tracked_count)=0 THEN 0
              ELSE round((sum(present_count)::numeric / sum(tracked_count)::numeric) * 100)::int
            END AS attendance_rate
          FROM team_session
          GROUP BY team_id,name,short_name,league,season,roster_count
          ORDER BY short_name NULLS LAST,name
        `,
        sql`
          SELECT
            date_trunc('month',s.scheduled_at AT TIME ZONE 'Europe/Berlin') AS month_start,
            count(DISTINCT s.id)::int AS trainings,
            count(a.member_id) FILTER (WHERE a.attendance='present')::int AS total_present,
            COALESCE(
              round(
                count(a.member_id) FILTER (WHERE a.attendance='present')::numeric
                / NULLIF(count(DISTINCT s.id),0),
                1
              ),
              0
            ) AS avg_present
          FROM training_sessions s
          LEFT JOIN training_attendance a ON a.session_id=s.id
          WHERE s.attendance_recorded_at IS NOT NULL
            AND s.status='completed'
            AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')=${selectedYear}
          GROUP BY 1
          ORDER BY 1
        `,
        sql`
          WITH recorded AS (
            SELECT id,scheduled_at
            FROM training_sessions
            WHERE attendance_recorded_at IS NOT NULL
              AND status='completed'
              AND EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'Europe/Berlin')=${selectedYear}
          )
          SELECT
            t.id::text AS team_id,
            COALESCE(t.short_name,t.name) AS team_name,
            date_trunc('month',s.scheduled_at AT TIME ZONE 'Europe/Berlin') AS month_start,
            count(DISTINCT s.id)::int AS trainings,
            COALESCE(
              round(
                count(a.member_id) FILTER (WHERE a.attendance='present')::numeric
                / NULLIF(count(DISTINCT s.id),0),
                1
              ),
              0
            ) AS avg_present
          FROM teams t
          JOIN team_members tm ON tm.team_id=t.id AND tm.is_active=true
          CROSS JOIN recorded s
          LEFT JOIN training_attendance a
            ON a.session_id=s.id
           AND a.member_id=tm.member_id
          WHERE t.status='active'
          GROUP BY
            t.id,t.short_name,t.name,
            date_trunc('month',s.scheduled_at AT TIME ZONE 'Europe/Berlin')
          ORDER BY team_name,month_start
        `,
        sql`
          SELECT
            m.id::text,
            m.first_name,
            m.last_name,
            COALESCE(
              string_agg(DISTINCT COALESCE(t.short_name,t.name),', ' ORDER BY COALESCE(t.short_name,t.name))
              FILTER (WHERE t.id IS NOT NULL),
              'Ohne Mannschaft'
            ) AS teams,
            count(DISTINCT s.id)::int AS recorded,
            count(DISTINCT s.id) FILTER (WHERE a.attendance='present')::int AS attended,
            count(DISTINCT s.id) FILTER (WHERE a.attendance='excused')::int AS excused,
            max(s.scheduled_at) FILTER (WHERE a.attendance='present') AS last_present,
            CASE
              WHEN count(DISTINCT s.id)=0 THEN 0
              ELSE round(
                count(DISTINCT s.id) FILTER (WHERE a.attendance='present')::numeric
                / count(DISTINCT s.id)::numeric * 100
              )::int
            END AS activity_rate
          FROM members m
          LEFT JOIN team_members tm ON tm.member_id=m.id AND tm.is_active=true
          LEFT JOIN teams t ON t.id=tm.team_id AND t.status='active'
          LEFT JOIN training_attendance a ON a.member_id=m.id
          LEFT JOIN training_sessions s
            ON s.id=a.session_id
           AND s.attendance_recorded_at IS NOT NULL
           AND s.status='completed'
           AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')=${selectedYear}
          WHERE m.status IN ('active','passive')
          GROUP BY m.id
          ORDER BY activity_rate DESC,attended DESC,m.last_name,m.first_name
        `,
      ])
    : [[],[{trainings:0,avg_present:0,max_present:0,total_visits:0,tuesday_avg:0,friday_avg:0,unique_members:0}],[],[],[],[]];

  const summary=summaryRows[0] ?? {};
  const yearOptions=[...new Set(yearRows.map((row)=>Number(row.year)).filter(Number.isFinite))];

  const monthsByTeam=new Map<string,Map<string,number>>();
  for (const row of teamMonthly) {
    const key=String(row.team_id);
    if (!monthsByTeam.has(key)) monthsByTeam.set(key,new Map());
    monthsByTeam.get(key)!.set(
      new Date(String(row.month_start)).toISOString().slice(0,7),
      Number(row.avg_present ?? 0),
    );
  }

  const monthKeys=monthly.map((row)=>new Date(String(row.month_start)).toISOString().slice(0,7));
  const maxOverall=Math.max(1,...monthly.map((row)=>Number(row.avg_present ?? 0)));

  return (
    <div className="page-stack training-report-page">
      <section className="page-heading training-report-heading">
        <div>
          <Link href="/training" className="back-link">← Training</Link>
          <span className="eyebrow">Auswertung</span>
          <h1>Trainingsbericht {selectedYear}</h1>
          <p>Jahresauswertung für Vorstand und Sportbetrieb mit Mannschaftsvergleich und Mitgliederaktivität.</p>
        </div>
        <div className="training-report-actions">
          <form method="get">
            <label>
              Jahr
              <select name="year" defaultValue={selectedYear}>
                {yearOptions.map((year)=>(
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <button className="mini-button">Anzeigen</button>
          </form>
          <PrintReportButton />
        </div>
      </section>

      <section className="training-report-meta">
        <div><span>Zeitraum</span><strong>01.01.–31.12.{selectedYear}</strong></div>
        <div><span>Regeltraining</span><strong>Dienstag & Freitag · 19:00 Uhr</strong></div>
        <div><span>Basis</span><strong>Nur gespeicherte Anwesenheiten</strong></div>
      </section>

      <section className="stat-grid">
        <article className="stat-card"><span>Trainings</span><strong>{Number(summary.trainings ?? 0)}</strong><small>erfasste Termine</small></article>
        <article className="stat-card"><span>Ø Teilnehmer</span><strong>{Number(summary.avg_present ?? 0).toLocaleString("de-DE")}</strong><small>pro Training</small></article>
        <article className="stat-card"><span>Höchste Beteiligung</span><strong>{Number(summary.max_present ?? 0)}</strong><small>Mitglieder an einem Abend</small></article>
        <article className="stat-card"><span>Teilnahmen gesamt</span><strong>{Number(summary.total_visits ?? 0)}</strong><small>{Number(summary.unique_members ?? 0)} unterschiedliche Mitglieder</small></article>
      </section>

      <section className="training-report-split">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Wochentage</span><h2>Dienstag vs. Freitag</h2></div></div>
          <div className="training-report-weekdays">
            <div><span>Dienstag</span><strong>{Number(summary.tuesday_avg ?? 0).toLocaleString("de-DE")} Ø</strong></div>
            <div><span>Freitag</span><strong>{Number(summary.friday_avg ?? 0).toLocaleString("de-DE")} Ø</strong></div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Saison</span><h2>Aktive Mannschaften</h2></div></div>
          <div className="training-report-seasons">
            {teams.map((team)=>(
              <div key={String(team.id)}>
                <strong>{String(team.short_name ?? team.name)}</strong>
                <span>{String(team.season ?? "Keine Saison")} · {String(team.league ?? "Keine Liga")}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="panel training-report-section">
        <div className="panel-head"><div><span className="eyebrow">Vergleich</span><h2>Mannschaften</h2></div></div>
        <p className="training-report-note">Die Mannschaftsauswertung verwendet die aktuell aktive Kaderzuordnung.</p>

        <div className="training-team-comparison">
          {teams.length===0 ? (
            <div className="empty-state">Keine aktiven Mannschaften vorhanden.</div>
          ) : teams.map((team)=>(
            <div className="training-team-card" key={String(team.id)}>
              <div className="training-team-head">
                <div>
                  <strong>{String(team.short_name ?? team.name)}</strong>
                  <span>{String(team.season ?? "–")} · {String(team.league ?? "–")}</span>
                </div>
                <b>{Number(team.attendance_rate ?? 0)}%</b>
              </div>
              <div className="training-team-metrics">
                <div><span>Kader</span><strong>{Number(team.roster_count ?? 0)}</strong></div>
                <div><span>Ø pro Training</span><strong>{Number(team.avg_present ?? 0).toLocaleString("de-DE")}</strong></div>
                <div><span>Teilnahmen</span><strong>{Number(team.present_total ?? 0)}</strong></div>
                <div><span>Entschuldigt</span><strong>{Number(team.excused_total ?? 0)}</strong></div>
              </div>
              <div className="training-team-rate"><i style={{width:`${pct(team.attendance_rate)}%`}} /></div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel training-report-section">
        <div className="panel-head"><div><span className="eyebrow">Entwicklung</span><h2>Monatsverlauf</h2></div></div>
        {monthly.length===0 ? (
          <div className="empty-state">Für {selectedYear} sind noch keine Anwesenheiten erfasst.</div>
        ) : (
          <div className="training-report-months">
            {monthly.map((row)=>(
              <div className="training-report-month" key={String(row.month_start)}>
                <div>
                  <strong>{monthLabel(row.month_start)}</strong>
                  <span>{Number(row.trainings ?? 0)} Trainings</span>
                </div>
                <b>{Number(row.avg_present ?? 0).toLocaleString("de-DE")} Ø</b>
                <div className="training-report-month-track">
                  <i style={{width:`${Math.round((Number(row.avg_present ?? 0)/maxOverall)*100)}%`}} />
                </div>
              </div>
            ))}
          </div>
        )}

        {teams.length>0 && monthKeys.length>0 && (
          <div className="training-team-month-table">
            <div className="training-team-month-head">
              <span>Mannschaft</span>
              {monthly.map((row)=>(
                <span key={String(row.month_start)}>
                  {new Intl.DateTimeFormat("de-DE",{month:"short",timeZone:"Europe/Berlin"}).format(new Date(String(row.month_start)))}
                </span>
              ))}
            </div>
            {teams.map((team)=>{
              const map=monthsByTeam.get(String(team.id)) ?? new Map<string,number>();
              return (
                <div className="training-team-month-row" key={String(team.id)}>
                  <strong>{String(team.short_name ?? team.name)}</strong>
                  {monthKeys.map((month)=>(
                    <span key={month}>{map.has(month) ? map.get(month)!.toLocaleString("de-DE") : "–"}</span>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="panel training-report-section">
        <div className="panel-head">
          <div><span className="eyebrow">Mitglieder</span><h2>Trainingsaktivität</h2></div>
          <span className="count-chip">{members.length}</span>
        </div>
        <div className="training-report-member-table">
          <div className="training-report-member-head">
            <span>Mitglied</span><span>Mannschaft</span><span>Besucht</span><span>Quote</span><span>Zuletzt da</span>
          </div>
          {members.map((member)=>(
            <Link href={`/mitglieder/${member.id}`} className="training-report-member-row" key={String(member.id)}>
              <strong>{String(member.first_name)} {String(member.last_name)}</strong>
              <span>{String(member.teams)}</span>
              <span>{Number(member.attended ?? 0)}/{Number(member.recorded ?? 0)}</span>
              <b>{Number(member.activity_rate ?? 0)}%</b>
              <span>{formatDate(member.last_present)}</span>
            </Link>
          ))}
        </div>
      </article>

      <section className="training-report-footer">
        <p>Hinweis: Entfallene Trainings und Termine ohne gespeicherte Anwesenheitsliste fließen nicht in die Quoten ein.</p>
      </section>
    </div>
  );
}
