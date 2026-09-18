import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  cancelTrainingSessionAction,
  restoreTrainingSessionAction,
  saveTrainingAttendanceAction,
} from "@/app/training/actions";

export const dynamic = "force-dynamic";

function formatDateTime(value: unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    weekday:"long",
    day:"2-digit",
    month:"2-digit",
    year:"numeric",
    hour:"2-digit",
    minute:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

const statusLabels: Record<string,string> = {
  planned:"Geplant",
  completed:"Erfasst",
  cancelled:"Abgesagt",
};

export default async function TrainingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id:string }>;
  searchParams: Promise<{ error?:string; saved?:string; cancelled?:string; restored?:string }>;
}) {
  const actor=await requirePermission("training.read");
  const sql=getDb();
  if (!sql) notFound();

  const { id }=await params;
  const query=await searchParams;
  const canWrite=hasPermission(actor.roles,"training.write");

  const [sessionRows,members,counts]=await Promise.all([
    sql`
      SELECT
        s.id::text,
        s.scheduled_at,
        s.status,
        s.notes,
        s.attendance_recorded_at,
        s.completed_at
      FROM training_sessions s
      WHERE s.id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT
        m.id::text,
        m.first_name,
        m.last_name,
        m.status,
        a.attendance
      FROM members m
      LEFT JOIN training_attendance a
        ON a.member_id=m.id
       AND a.session_id=${id}::uuid
      WHERE m.status IN ('active','passive')
      ORDER BY
        CASE COALESCE(a.attendance,'absent')
          WHEN 'present' THEN 0
          WHEN 'excused' THEN 1
          ELSE 2
        END,
        m.last_name,m.first_name
    `,
    sql`
      SELECT
        count(*) FILTER (WHERE attendance='present')::int AS present,
        count(*) FILTER (WHERE attendance='absent')::int AS absent,
        count(*) FILTER (WHERE attendance='excused')::int AS excused
      FROM training_attendance
      WHERE session_id=${id}::uuid
    `,
  ]);

  const session=sessionRows[0];
  if (!session) notFound();

  const c=counts[0] ?? {};
  const isFuture=new Date(String(session.scheduled_at)).getTime()>Date.now();
  const editable=canWrite && !isFuture && session.status!=="cancelled";

  return (
    <div className="page-stack">
      <section className="meeting-hero">
        <div>
          <Link href="/training" className="back-link">← Training</Link>
          <span className="eyebrow">Trainingstag</span>
          <h1>{formatDateTime(session.scheduled_at)}</h1>
          <p>Beginn 19:00 Uhr · Ende offen</p>
        </div>
        <div className="meeting-hero-side">
          <b className={`status-badge training-status-${session.status}`}>
            {statusLabels[String(session.status)] ?? String(session.status)}
          </b>
        </div>
      </section>

      {query.error==="future" && <div className="form-error">Die Anwesenheit kann erst ab Beginn des Trainingstags gespeichert werden.</div>}
      {query.error==="session" && <div className="form-error">Für einen abgesagten Trainingstag kann keine Anwesenheit gespeichert werden.</div>}
      {query.saved && <div className="form-success">Anwesenheit wurde gespeichert.</div>}
      {query.cancelled && <div className="form-success">Trainingstag wurde als abgesagt markiert.</div>}
      {query.restored && <div className="form-success">Trainingstag wurde wieder aktiviert.</div>}

      <section className="meeting-summary-grid">
        <article><span>Anwesend</span><strong>{Number(c.present ?? 0)}</strong><small>Mitglieder</small></article>
        <article><span>Nicht da</span><strong>{Number(c.absent ?? 0)}</strong><small>Mitglieder</small></article>
        <article><span>Entschuldigt</span><strong>{Number(c.excused ?? 0)}</strong><small>Mitglieder</small></article>
        <article>
          <span>Anwesenheit</span>
          <strong>{session.attendance_recorded_at ? "Erfasst" : "Offen"}</strong>
          <small>{session.attendance_recorded_at ? new Date(String(session.attendance_recorded_at)).toLocaleString("de-DE") : "noch nicht gespeichert"}</small>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Anwesenheit</span>
              <h2>Mitglieder</h2>
            </div>
            <span className="count-chip">{members.length}</span>
          </div>

          {isFuture && (
            <div className="training-info-box">
              Die Anwesenheitsliste wird ab Trainingsbeginn freigeschaltet.
            </div>
          )}

          {session.status==="cancelled" && (
            <div className="training-info-box">Dieser Trainingstag ist abgesagt und zählt nicht in die Aktivitätsquote.</div>
          )}

          <form action={saveTrainingAttendanceAction} className="training-attendance-form">
            <input type="hidden" name="sessionId" value={id} />

            <div className="training-attendance-list">
              {members.map((member)=>(
                <div className="training-attendance-row" key={String(member.id)}>
                  <div className="member-avatar">
                    {String(member.first_name).slice(0,1)}{String(member.last_name).slice(0,1)}
                  </div>
                  <div>
                    <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                    <span>{member.status==="passive" ? "Passives Mitglied" : "Aktives Mitglied"}</span>
                  </div>
                  <select
                    name={`attendance_${member.id}`}
                    defaultValue={member.attendance ? String(member.attendance) : "absent"}
                    disabled={!editable}
                  >
                    <option value="present">Anwesend</option>
                    <option value="absent">Nicht anwesend</option>
                    <option value="excused">Entschuldigt</option>
                  </select>
                </div>
              ))}
            </div>

            {editable && (
              <div className="training-save-bar">
                <p>Nicht auf „Anwesend“ gesetzte Mitglieder werden für diesen erfassten Trainingstag als nicht anwesend geführt.</p>
                <button className="primary-button">Anwesenheit speichern</button>
              </div>
            )}
          </form>
        </article>

        {canWrite && (
          <aside className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Trainingstag</span><h2>Verwalten</h2></div>
            </div>

            <div className="training-session-meta">
              <div><span>Termin</span><strong>{formatDateTime(session.scheduled_at)}</strong></div>
              <div><span>Beginn</span><strong>19:00 Uhr</strong></div>
              <div><span>Ende</span><strong>Offen</strong></div>
              <div><span>Status</span><strong>{statusLabels[String(session.status)] ?? String(session.status)}</strong></div>
            </div>

            {session.status==="cancelled" ? (
              <form action={restoreTrainingSessionAction}>
                <input type="hidden" name="sessionId" value={id} />
                <button className="ghost-button">Training wieder aktivieren</button>
              </form>
            ) : (
              <form action={cancelTrainingSessionAction}>
                <input type="hidden" name="sessionId" value={id} />
                <button className="ghost-button">Training absagen</button>
              </form>
            )}
          </aside>
        )}
      </section>
    </div>
  );
}
