import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ensureTrainingSchedule } from "@/lib/training";
import {
  createSpecialTrainingAction,
  createTrainingPauseAction,
  deleteTrainingPauseAction,
  refreshTrainingScheduleAction,
} from "@/app/training/actions";

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

function formatDate(value: unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",
    month:"2-digit",
    year:"numeric",
    timeZone:"Europe/Berlin",
  }).format(date);
}

function rate(attended: unknown, recorded: unknown) {
  const total=Number(recorded ?? 0);
  return total ? Math.round((Number(attended ?? 0)/total)*100) : 0;
}

function daysSince(value: unknown) {
  if (!value) return null;
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0,Math.floor((Date.now()-date.getTime())/86400000));
}

function monthLabel(value: unknown) {
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{month:"short",year:"2-digit",timeZone:"Europe/Berlin"}).format(date);
}

type Filter = "all" | "high" | "medium" | "low" | "inactive";

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{
    refreshed?: string;
    pause?: string;
    pause_removed?: string;
    error?: string;
    filter?: string;
  }>;
}) {
  const actor=await requirePermission("training.read");
  await ensureTrainingSchedule(365);
  const sql=getDb();
  const params=await searchParams;
  const canWrite=hasPermission(actor.roles,"training.write");
  const selectedFilter: Filter = ["high","medium","low","inactive"].includes(params.filter ?? "")
    ? params.filter as Filter
    : "all";

  const [upcoming,recent,activity,summaryRows,weekdayRows,monthlyRows,pauses] = sql
    ? await Promise.all([
        sql`
          SELECT
            s.id::text,
            s.scheduled_at,
            s.status,
            s.source,
            s.notes,
            s.attendance_recorded_at,
            count(a.member_id) FILTER (WHERE a.attendance='present')::int AS present
          FROM training_sessions s
          LEFT JOIN training_attendance a ON a.session_id=s.id
          WHERE s.scheduled_at >= now()
          GROUP BY s.id
          ORDER BY s.scheduled_at
          LIMIT 10
        `,
        sql`
          SELECT
            s.id::text,
            s.scheduled_at,
            s.status,
            s.source,
            s.notes,
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
            count(s.id) FILTER (
              WHERE EXTRACT(ISODOW FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')=2
            )::int AS tue_recorded,
            count(s.id) FILTER (
              WHERE a.attendance='present'
                AND EXTRACT(ISODOW FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')=2
            )::int AS tue_attended,
            count(s.id) FILTER (
              WHERE EXTRACT(ISODOW FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')=5
            )::int AS fri_recorded,
            count(s.id) FILTER (
              WHERE a.attendance='present'
                AND EXTRACT(ISODOW FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')=5
            )::int AS fri_attended,
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
            ) AS next_training,
            (
              SELECT count(*)::int
              FROM training_sessions
              WHERE scheduled_at<now()
                AND status<>'cancelled'
                AND attendance_recorded_at IS NULL
            ) AS pending
        `,
        sql`
          SELECT
            EXTRACT(ISODOW FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')::int AS weekday,
            count(*)::int AS trainings,
            COALESCE(round(avg(x.present_count)),0)::int AS avg_present
          FROM training_sessions s
          JOIN (
            SELECT
              s2.id,
              count(a.member_id) FILTER (WHERE a.attendance='present')::numeric AS present_count
            FROM training_sessions s2
            LEFT JOIN training_attendance a ON a.session_id=s2.id
            WHERE s2.attendance_recorded_at IS NOT NULL
              AND s2.status='completed'
              AND EXTRACT(YEAR FROM s2.scheduled_at AT TIME ZONE 'Europe/Berlin')
                  = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY s2.id
          ) x ON x.id=s.id
          WHERE EXTRACT(ISODOW FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin') IN (2,5)
          GROUP BY 1
          ORDER BY 1
        `,
        sql`
          SELECT
            date_trunc('month',s.scheduled_at AT TIME ZONE 'Europe/Berlin') AS month_start,
            count(*)::int AS trainings,
            COALESCE(round(avg(x.present_count),1),0) AS avg_present
          FROM training_sessions s
          JOIN (
            SELECT
              s2.id,
              count(a.member_id) FILTER (WHERE a.attendance='present')::numeric AS present_count
            FROM training_sessions s2
            LEFT JOIN training_attendance a ON a.session_id=s2.id
            WHERE s2.attendance_recorded_at IS NOT NULL
              AND s2.status='completed'
            GROUP BY s2.id
          ) x ON x.id=s.id
          WHERE s.scheduled_at >= date_trunc('month',now()) - interval '11 months'
          GROUP BY 1
          ORDER BY 1
        `,
        sql`
          SELECT id::text,starts_on,ends_on,reason
          FROM training_blackouts
          WHERE ends_on>=CURRENT_DATE
          ORDER BY starts_on
          LIMIT 10
        `,
      ])
    : [[],[],[],[{recorded:0,avg_present:0,next_training:null,pending:0}],[],[],[]];

  const summary=summaryRows[0] ?? {};
  const membersWithData=activity.filter((member)=>Number(member.recorded_trainings)>0);
  const averageRate=membersWithData.length
    ? Math.round(membersWithData.reduce((sum,row)=>sum+Number(row.activity_rate ?? 0),0)/membersWithData.length)
    : 0;

  const weekday = new Map(weekdayRows.map((row)=>[Number(row.weekday),row]));
  const tuesday=weekday.get(2);
  const friday=weekday.get(5);

  const filteredActivity=activity.filter((member)=>{
    const memberRate=Number(member.activity_rate ?? 0);
    const absentDays=daysSince(member.last_present);
    if (selectedFilter==="high") return memberRate>75;
    if (selectedFilter==="medium") return memberRate>=50 && memberRate<=75;
    if (selectedFilter==="low") return Number(member.recorded_trainings)>0 && memberRate<50;
    if (selectedFilter==="inactive") {
      return Number(member.recorded_trainings)>0 && (absentDays===null || absentDays>=30);
    }
    return true;
  });

  const errorLabels: Record<string,string> = {
    special:"Sondertraining konnte nicht angelegt werden.",
    duplicate_training:"Zu diesem Zeitpunkt existiert bereits ein Training.",
    pause:"Die Trainingspause konnte nicht gespeichert werden.",
    database:"Datenbank ist nicht verfügbar.",
  };

  return (
    <div className="page-stack">
      <section className="page-heading training-heading">
        <div>
          <span className="eyebrow">Sportbetrieb</span>
          <h1>Training</h1>
          <p>Dienstag und Freitag · Beginn 19:00 Uhr · Ende offen. Anwesenheit wird händisch mit einem Klick pro Mitglied erfasst.</p>
        </div>
        <div className="training-heading-actions">
          <Link href="/training/auswertung" className="ghost-button">Auswertung</Link>
          {canWrite && (
            <form action={refreshTrainingScheduleAction}>
              <button className="ghost-button">Terminplan aktualisieren</button>
            </form>
          )}
        </div>
      </section>

      {params.error && <div className="form-error">{errorLabels[params.error] ?? "Die Trainingsaktion konnte nicht ausgeführt werden."}</div>}
      {params.refreshed && <div className="form-success">Trainingskalender wurde für die nächsten 12 Monate aktualisiert.</div>}
      {params.pause && <div className="form-success">Trainingspause wurde eingetragen.</div>}
      {params.pause_removed && <div className="form-success">Trainingspause wurde aufgehoben.</div>}

      <section className="stat-grid">
        <article className="stat-card">
          <span>Nächstes Training</span>
          <strong>{summary.next_training ? formatTrainingDate(summary.next_training) : "–"}</strong>
          <small>Ende offen</small>
        </article>
        <article className="stat-card">
          <span>Erfasste Trainings</span>
          <strong>{Number(summary.recorded ?? 0)}</strong>
          <small>dieses Jahr</small>
        </article>
        <article className="stat-card">
          <span>Ø Teilnehmer</span>
          <strong>{Number(summary.avg_present ?? 0)}</strong>
          <small>pro erfasstem Training</small>
        </article>
        <article className="stat-card">
          <span>Anwesenheit offen</span>
          <strong>{Number(summary.pending ?? 0)}</strong>
          <small>vergangene Trainingstage</small>
        </article>
      </section>

      <section className="training-weekday-grid">
        <article className="panel training-weekday-card">
          <span className="eyebrow">Dienstag</span>
          <strong>{Number(tuesday?.avg_present ?? 0)} Ø Teilnehmer</strong>
          <small>{Number(tuesday?.trainings ?? 0)} erfasste Trainings</small>
        </article>
        <article className="panel training-weekday-card">
          <span className="eyebrow">Freitag</span>
          <strong>{Number(friday?.avg_present ?? 0)} Ø Teilnehmer</strong>
          <small>{Number(friday?.trainings ?? 0)} erfasste Trainings</small>
        </article>
        <article className="panel training-weekday-card">
          <span className="eyebrow">Verein</span>
          <strong>{averageRate}% Ø Aktivität</strong>
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
                  <strong>
                    {session.status==="cancelled"
                      ? "Training entfällt"
                      : session.source==="special"
                        ? "Sondertraining"
                        : "Vereinstraining"}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat("de-DE",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Berlin"}).format(new Date(String(session.scheduled_at)))} Uhr · Ende offen
                  </span>
                  {session.source==="special" && session.notes && <small>{String(session.notes)}</small>}
                </div>
                <b>{session.status==="cancelled" ? "ENTFÄLLT" : "Öffnen ›"}</b>
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
                      ? "Entfallen"
                      : session.attendance_recorded_at
                        ? `${Number(session.present ?? 0)} anwesend`
                        : "Anwesenheit noch offen"}
                  </span>
                  {session.present_names && <small>{String(session.present_names)}</small>}
                  {session.notes && !String(session.notes).startsWith("pause:") && <small>Notiz: {String(session.notes)}</small>}
                </div>
                <b>{session.attendance_recorded_at ? "Erfasst" : session.status==="cancelled" ? "–" : "Offen"}</b>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Entwicklung</span><h2>Teilnehmer pro Monat</h2></div>
        </div>
        <div className="training-month-grid">
          {monthlyRows.length===0 ? (
            <div className="empty-state">Für die Monatsentwicklung sind noch keine Anwesenheiten erfasst.</div>
          ) : monthlyRows.map((month)=>{
            const max=Math.max(1,...monthlyRows.map((row)=>Number(row.avg_present ?? 0)));
            const width=Math.round((Number(month.avg_present ?? 0)/max)*100);
            return (
              <div className="training-month-card" key={String(month.month_start)}>
                <span>{monthLabel(month.month_start)}</span>
                <strong>{Number(month.avg_present ?? 0).toLocaleString("de-DE")} Ø</strong>
                <div><i style={{width:`${width}%`}} /></div>
                <small>{Number(month.trainings ?? 0)} Trainings</small>
              </div>
            );
          })}
        </div>
      </article>

      <article className="panel">
        <div className="panel-head training-activity-head">
          <div>
            <span className="eyebrow">Aktivität {new Date().getFullYear()}</span>
            <h2>Trainingsbeteiligung der Mitglieder</h2>
          </div>
          <span className="count-chip">{filteredActivity.length}/{activity.length}</span>
        </div>

        <div className="training-filter-bar">
          <Link href="/training" className={selectedFilter==="all" ? "active" : ""}>Alle</Link>
          <Link href="/training?filter=high" className={selectedFilter==="high" ? "active" : ""}>über 75 %</Link>
          <Link href="/training?filter=medium" className={selectedFilter==="medium" ? "active" : ""}>50–75 %</Link>
          <Link href="/training?filter=low" className={selectedFilter==="low" ? "active" : ""}>unter 50 %</Link>
          <Link href="/training?filter=inactive" className={selectedFilter==="inactive" ? "active" : ""}>30+ Tage nicht da</Link>
        </div>

        <p className="training-activity-note">Die Quote basiert nur auf Trainingstagen mit gespeicherter Anwesenheit. Entfallene Termine zählen nicht.</p>

        <div className="training-activity-list">
          {filteredActivity.length===0 ? (
            <div className="empty-state">Keine Mitglieder entsprechen diesem Filter.</div>
          ) : filteredActivity.map((member,index)=>{
            const absentDays=daysSince(member.last_present);
            const tueRate=rate(member.tue_attended,member.tue_recorded);
            const friRate=rate(member.fri_attended,member.fri_recorded);
            return (
              <Link href={`/mitglieder/${member.id}`} className="training-activity-row training-activity-row-rich" key={String(member.id)}>
                <span className="training-rank">{index+1}</span>
                <div className="member-avatar">{String(member.first_name).slice(0,1)}{String(member.last_name).slice(0,1)}</div>
                <div className="training-member">
                  <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                  <span>
                    {Number(member.recorded_trainings)===0
                      ? "Noch keine erfassten Trainingstage"
                      : `${Number(member.attended)} von ${Number(member.recorded_trainings)} besucht · zuletzt ${formatDate(member.last_present)}`}
                  </span>
                  <small>
                    Dienstag {tueRate}% · Freitag {friRate}%
                    {Number(member.recorded_trainings)>0 && (absentDays===null || absentDays>=30)
                      ? ` · ${absentDays===null ? "noch nie anwesend" : `seit ${absentDays} Tagen nicht da`}`
                      : ""}
                  </small>
                </div>
                <div className="training-rate">
                  <strong>{Number(member.activity_rate)}%</strong>
                  <div><i style={{width:`${Math.min(100,Number(member.activity_rate))}%`}} /></div>
                </div>
              </Link>
            );
          })}
        </div>
      </article>

      {canWrite && (
        <section className="training-management-grid">
          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Zusatztermin</span><h2>Sondertraining</h2></div></div>
            <form action={createSpecialTrainingAction} className="form-stack">
              <div className="form-grid">
                <label>Datum<input name="date" type="date" required /></label>
                <label>Beginn<input name="time" type="time" defaultValue="19:00" required /></label>
              </div>
              <label>Notiz<textarea name="note" rows={3} placeholder="z. B. Ligavorbereitung oder Extra-Training" /></label>
              <button className="primary-button">Sondertraining anlegen</button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Pause</span><h2>Trainingspause</h2></div></div>
            <form action={createTrainingPauseAction} className="form-stack">
              <div className="form-grid">
                <label>Von<input name="startsOn" type="date" required /></label>
                <label>Bis<input name="endsOn" type="date" required /></label>
              </div>
              <label>Grund<input name="reason" placeholder="z. B. Weihnachten, Vereinsheim geschlossen" /></label>
              <button className="primary-button">Pause eintragen</button>
            </form>

            {pauses.length>0 && (
              <div className="training-pause-list">
                {pauses.map((pause)=>(
                  <div key={String(pause.id)}>
                    <div>
                      <strong>{formatDate(pause.starts_on)} – {formatDate(pause.ends_on)}</strong>
                      <span>{pause.reason ? String(pause.reason) : "Trainingspause"}</span>
                    </div>
                    <form action={deleteTrainingPauseAction}>
                      <input type="hidden" name="pauseId" value={String(pause.id)} />
                      <button className="mini-button">Pause aufheben</button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
