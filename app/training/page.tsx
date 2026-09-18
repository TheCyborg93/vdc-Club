import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ensureTrainingSchedule } from "@/lib/training";
import { refreshTrainingScheduleAction } from "@/app/training/actions";

export const dynamic = "force-dynamic";

function formatTrainingDate(value: unknown, withTime = true) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    weekday:"short",
    day:"2-digit",
    month:"2-digit",
    ...(withTime ? {hour:"2-digit",minute:"2-digit"} : {}),
    timeZone:"Europe/Berlin",
  }).format(date);
}

function formatLast(value: unknown) {
  if (!value) return "Noch nie";
  return formatTrainingDate(value,false);
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ refreshed?: string }>;
}) {
  const actor=await requirePermission("training.read");
  await ensureTrainingSchedule(365);
  const sql=getDb();
  const params=await searchParams;
  const canWrite=hasPermission(actor.roles,"training.write");

  const [upcoming,recent,activity,summaryRows] = sql
    ? await Promise.all([
        sql`
          SELECT
            s.id::text,
            s.scheduled_at,
            s.status,
            s.attendance_recorded_at,
            count(a.member_id) FILTER (WHERE a.attendance='present')::int AS present
          FROM training_sessions s
          LEFT JOIN training_attendance a ON a.session_id=s.id
          WHERE s.scheduled_at >= now()
          GROUP BY s.id
          ORDER BY s.scheduled_at
          LIMIT 8
        `,
        sql`
          SELECT
            s.id::text,
            s.scheduled_at,
            s.status,
            s.attendance_recorded_at,
            count(a.member_id) FILTER (WHERE a.attendance='present')::int AS present,
            count(a.member_id) FILTER (WHERE a.attendance='absent')::int AS absent,
            count(a.member_id) FILTER (WHERE a.attendance='excused')::int AS excused,
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
        sql`
          SELECT
            m.id::text,
            m.first_name,
            m.last_name,
            count(s.id)::int AS recorded_trainings,
            count(s.id) FILTER (WHERE a.attendance='present')::int AS attended,
            count(s.id) FILTER (WHERE a.attendance='excused')::int AS excused,
            max(s.scheduled_at) FILTER (WHERE a.attendance='present') AS last_present,
            CASE
              WHEN count(s.id)=0 THEN 0
              ELSE round(
                (count(s.id) FILTER (WHERE a.attendance='present')::numeric / count(s.id)::numeric) * 100
              )::int
            END AS activity_rate
          FROM members m
          LEFT JOIN training_attendance a ON a.member_id=m.id
          LEFT JOIN training_sessions s
            ON s.id=a.session_id
           AND s.attendance_recorded_at IS NOT NULL
           AND s.status='completed'
           AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')
               = EXTRACT(YEAR FROM CURRENT_DATE)
          WHERE m.status IN ('active','passive')
          GROUP BY m.id
          ORDER BY activity_rate DESC,attended DESC,m.last_name,m.first_name
        `,
        sql`
          SELECT
            (
              SELECT count(*)::int
              FROM training_sessions
              WHERE attendance_recorded_at IS NOT NULL
                AND status='completed'
                AND EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'Europe/Berlin')
                    = EXTRACT(YEAR FROM CURRENT_DATE)
            ) AS recorded,
            (
              SELECT COALESCE(round(avg(present_count)),0)::int
              FROM (
                SELECT
                  s.id,
                  count(a.member_id) FILTER (WHERE a.attendance='present')::numeric AS present_count
                FROM training_sessions s
                LEFT JOIN training_attendance a ON a.session_id=s.id
                WHERE s.attendance_recorded_at IS NOT NULL
                  AND s.status='completed'
                  AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')
                      = EXTRACT(YEAR FROM CURRENT_DATE)
                GROUP BY s.id
              ) x
            ) AS avg_present,
            (
              SELECT scheduled_at
              FROM training_sessions
              WHERE scheduled_at>=now() AND status<>'cancelled'
              ORDER BY scheduled_at
              LIMIT 1
            ) AS next_training
        `,
      ])
    : [[],[],[],[{recorded:0,avg_present:0,next_training:null}]];

  const summary=summaryRows[0] ?? {};
  const membersWithData=activity.filter((member)=>Number(member.recorded_trainings)>0);
  const averageRate=membersWithData.length
    ? Math.round(membersWithData.reduce((sum,row)=>sum+Number(row.activity_rate ?? 0),0)/membersWithData.length)
    : 0;

  return (
    <div className="page-stack">
      <section className="page-heading training-heading">
        <div>
          <span className="eyebrow">Sportbetrieb</span>
          <h1>Training</h1>
          <p>Dienstag und Freitag · Beginn 19:00 Uhr · Ende offen. Anwesenheit und Trainingsaktivität werden zentral geführt.</p>
        </div>
        {canWrite && (
          <form action={refreshTrainingScheduleAction}>
            <button className="ghost-button">Terminplan aktualisieren</button>
          </form>
        )}
      </section>

      {params.refreshed && <div className="form-success">Trainingskalender wurde für die nächsten 12 Monate aktualisiert.</div>}

      <section className="stat-grid">
        <article className="stat-card">
          <span>Nächstes Training</span>
          <strong>{summary.next_training ? formatTrainingDate(summary.next_training) : "–"}</strong>
          <small>19:00 Uhr · Ende offen</small>
        </article>
        <article className="stat-card">
          <span>Erfasste Trainings</span>
          <strong>{Number(summary.recorded ?? 0)}</strong>
          <small>mit Anwesenheitsliste dieses Jahr</small>
        </article>
        <article className="stat-card">
          <span>Ø Teilnehmer</span>
          <strong>{Number(summary.avg_present ?? 0)}</strong>
          <small>pro erfasstem Training</small>
        </article>
        <article className="stat-card">
          <span>Ø Aktivität</span>
          <strong>{averageRate}%</strong>
          <small>Mitglieder mit erfassten Daten</small>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Plan</span><h2>Nächste Trainingstage</h2></div>
            <span className="training-rule-chip">DI + FR · 19:00</span>
          </div>
          <div className="training-upcoming-list">
            {upcoming.map((session)=>(
              <Link href={`/training/${session.id}`} key={String(session.id)} className={`training-upcoming-row training-${session.status}`}>
                <div className="training-date-badge">
                  <strong>{new Intl.DateTimeFormat("de-DE",{weekday:"short",timeZone:"Europe/Berlin"}).format(new Date(String(session.scheduled_at))).toUpperCase()}</strong>
                  <span>{new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"2-digit",timeZone:"Europe/Berlin"}).format(new Date(String(session.scheduled_at)))}</span>
                </div>
                <div>
                  <strong>{session.status==="cancelled" ? "Training abgesagt" : "Vereinstraining"}</strong>
                  <span>19:00 Uhr · Ende offen</span>
                </div>
                <b>{session.status==="cancelled" ? "ABGESAGT" : "Öffnen ›"}</b>
              </Link>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Zuletzt</span><h2>Anwesenheit</h2></div>
          </div>
          <div className="training-history-list">
            {recent.length===0 ? (
              <div className="empty-state">Noch keine vergangenen Trainingstage vorhanden.</div>
            ) : recent.slice(0,6).map((session)=>(
              <Link href={`/training/${session.id}`} className="training-history-row" key={String(session.id)}>
                <div>
                  <strong>{formatTrainingDate(session.scheduled_at)}</strong>
                  <span>
                    {session.status==="cancelled"
                      ? "Abgesagt"
                      : session.attendance_recorded_at
                        ? `${Number(session.present ?? 0)} anwesend`
                        : "Anwesenheit noch offen"}
                  </span>
                  {session.present_names && <small>{String(session.present_names)}</small>}
                </div>
                <b>{session.attendance_recorded_at ? "Erfasst" : session.status==="cancelled" ? "–" : "Offen"}</b>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Aktivität {new Date().getFullYear()}</span>
            <h2>Trainingsbeteiligung der Mitglieder</h2>
          </div>
          <span className="count-chip">{activity.length}</span>
        </div>
        <p className="training-activity-note">Die Quote basiert ausschließlich auf Trainingstagen, bei denen eine Anwesenheitsliste gespeichert wurde. Abgesagte Termine zählen nicht.</p>
        <div className="training-activity-list">
          {activity.map((member,index)=>(
            <Link href={`/mitglieder/${member.id}`} className="training-activity-row" key={String(member.id)}>
              <span className="training-rank">{index+1}</span>
              <div className="member-avatar">{String(member.first_name).slice(0,1)}{String(member.last_name).slice(0,1)}</div>
              <div className="training-member">
                <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                <span>
                  {Number(member.recorded_trainings)===0
                    ? "Noch keine erfassten Trainingstage"
                    : `${Number(member.attended)} von ${Number(member.recorded_trainings)} Trainings besucht · zuletzt ${formatLast(member.last_present)}`}
                </span>
              </div>
              <div className="training-rate">
                <strong>{Number(member.activity_rate)}%</strong>
                <div><i style={{width:`${Math.min(100,Number(member.activity_rate))}%`}} /></div>
              </div>
            </Link>
          ))}
        </div>
      </article>
    </div>
  );
}
