import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  createResolutionTaskAction,
  updateResolutionStatusAction,
} from "@/app/beschluesse/actions";

const statusLabels: Record<string, string> = {
  open: "Offen",
  in_progress: "In Umsetzung",
  implemented: "Umgesetzt",
  withdrawn: "Aufgehoben",
};

export const dynamic = "force-dynamic";

function formatDate(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function ResolutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; task?: string }>;
}) {
  const actor = await requirePermission("resolutions.read");
  const sql = getDb();
  const params = await searchParams;

  const [resolutions, counts, members] = sql
    ? await Promise.all([
        sql`
          SELECT
            r.id::text,
            r.resolution_number,
            r.title,
            r.decision_text,
            r.votes_yes,
            r.votes_no,
            r.votes_abstain,
            r.status,
            r.decided_at,
            m.id::text AS meeting_id,
            m.title AS meeting_title,
            ai.position AS agenda_position,
            ai.title AS agenda_title,
            t.id::text AS task_id,
            t.title AS task_title,
            t.status AS task_status,
            t.due_date AS task_due_date,
            owner.first_name AS owner_first_name,
            owner.last_name AS owner_last_name
          FROM resolutions r
          LEFT JOIN meetings m ON m.id = r.meeting_id
          LEFT JOIN agenda_items ai ON ai.id = r.agenda_item_id
          LEFT JOIN tasks t
            ON t.source_type = 'resolution'
           AND t.source_id = r.id
           AND t.status <> 'cancelled'
          LEFT JOIN members owner ON owner.id = t.owner_member_id
          ORDER BY r.decided_at DESC, r.resolution_number DESC
        `,
        sql`
          SELECT
            count(*) FILTER (
              WHERE EXTRACT(YEAR FROM decided_at) = EXTRACT(YEAR FROM CURRENT_DATE)
            )::int AS total,
            count(*) FILTER (WHERE status = 'implemented')::int AS implemented,
            count(*) FILTER (WHERE status = 'in_progress')::int AS progress,
            count(*) FILTER (WHERE status = 'open')::int AS open
          FROM resolutions
        `,
        sql`
          SELECT id::text, first_name, last_name
          FROM members
          WHERE status = 'active'
          ORDER BY last_name, first_name
        `,
      ])
    : [[], [{ total: 0, implemented: 0, progress: 0, open: 0 }], []];

  const count = counts[0] ?? {};
  const canWrite = hasPermission(actor.roles, "resolutions.write");
  const canCreateTasks = hasPermission(actor.roles, "tasks.write");

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Beschlüsse</h1>
          <p>Beschlussbuch mit Abstimmung, Herkunft aus der Sitzung und Stand der Umsetzung.</p>
        </div>
      </section>

      {params.error && <div className="form-error">Die Aktion konnte nicht ausgeführt werden.</div>}
      {params.task && <div className="form-success">Folgeaufgabe wurde angelegt.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Gesamt</span><strong>{Number(count.total ?? 0)}</strong><small>dieses Jahr</small></article>
        <article className="stat-card"><span>Umgesetzt</span><strong>{Number(count.implemented ?? 0)}</strong><small>abgeschlossen</small></article>
        <article className="stat-card"><span>In Umsetzung</span><strong>{Number(count.progress ?? 0)}</strong><small>laufend</small></article>
        <article className="stat-card"><span>Offen</span><strong>{Number(count.open ?? 0)}</strong><small>noch ohne Abschluss</small></article>
      </section>

      <section className="resolution-register">
        {resolutions.length === 0 ? (
          <article className="panel"><div className="empty-state">Noch keine Beschlüsse vorhanden.</div></article>
        ) : resolutions.map((resolution) => (
          <article className="resolution-card" key={String(resolution.id)}>
            <div className="resolution-card-number">
              <span>Beschluss</span>
              <strong>{resolution.resolution_number ? String(resolution.resolution_number) : "ohne Nr."}</strong>
              <small>{formatDate(resolution.decided_at)}</small>
            </div>

            <div className="resolution-card-body">
              <div className="resolution-card-head">
                <div>
                  <h2>{String(resolution.title)}</h2>
                  {resolution.meeting_id && (
                    <Link href={`/sitzungen/${resolution.meeting_id}`}>
                      {String(resolution.meeting_title)}
                      {resolution.agenda_position ? ` · TOP ${resolution.agenda_position}` : ""}
                    </Link>
                  )}
                </div>
                <b className={`resolution-status resolution-status-${resolution.status}`}>
                  {statusLabels[String(resolution.status)] ?? String(resolution.status)}
                </b>
              </div>

              <p className="resolution-text">{String(resolution.decision_text)}</p>

              <div className="resolution-meta-grid">
                <div><span>Ja</span><strong>{Number(resolution.votes_yes)}</strong></div>
                <div><span>Nein</span><strong>{Number(resolution.votes_no)}</strong></div>
                <div><span>Enthaltung</span><strong>{Number(resolution.votes_abstain)}</strong></div>
              </div>

              {resolution.task_id ? (
                <div className="resolution-task-box">
                  <div>
                    <span className="eyebrow">Folgeaufgabe</span>
                    <strong>{String(resolution.task_title)}</strong>
                    <small>
                      {resolution.owner_first_name
                        ? `${resolution.owner_first_name} ${resolution.owner_last_name}`
                        : "Nicht zugewiesen"}
                      {resolution.task_due_date ? ` · Frist ${formatDate(resolution.task_due_date)}` : ""}
                    </small>
                  </div>
                  <b className={`status-badge status-${resolution.task_status}`}>{String(resolution.task_status)}</b>
                </div>
              ) : canCreateTasks ? (
                <details className="resolution-task-create">
                  <summary>Folgeaufgabe anlegen</summary>
                  <form action={createResolutionTaskAction} className="form-stack">
                    <input type="hidden" name="resolutionId" value={String(resolution.id)} />
                    <label>Titel
                      <input
                        name="title"
                        defaultValue={`Beschluss umsetzen: ${String(resolution.title)}`}
                        required
                      />
                    </label>
                    <label>Beschreibung
                      <textarea name="description" rows={3} defaultValue={String(resolution.decision_text)} />
                    </label>
                    <div className="form-grid">
                      <label>Verantwortlich
                        <select name="ownerMemberId" defaultValue="">
                          <option value="">Noch offen</option>
                          {members.map((member) => (
                            <option key={String(member.id)} value={String(member.id)}>
                              {String(member.first_name)} {String(member.last_name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Frist<input name="dueDate" type="date" /></label>
                    </div>
                    <button className="primary-button" type="submit">Aufgabe anlegen</button>
                  </form>
                </details>
              ) : null}

              {canWrite && (
                <div className="resolution-actions">
                  {resolution.status !== "open" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                      <input type="hidden" name="status" value="open" />
                      <button className="mini-button">Offen</button>
                    </form>
                  )}
                  {resolution.status !== "in_progress" && resolution.status !== "implemented" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                      <input type="hidden" name="status" value="in_progress" />
                      <button className="mini-button">In Umsetzung</button>
                    </form>
                  )}
                  {resolution.status !== "implemented" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                      <input type="hidden" name="status" value="implemented" />
                      <button className="mini-button task-done-button">Umgesetzt</button>
                    </form>
                  )}
                  {resolution.status !== "withdrawn" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                      <input type="hidden" name="status" value="withdrawn" />
                      <button className="mini-button">Aufgehoben</button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
