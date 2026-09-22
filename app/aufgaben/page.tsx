import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  createTaskAction,
  updateTaskDetailsAction,
  updateTaskStatusAction,
} from "@/app/aufgaben/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const errors: Record<string, string> = {
  database: "Die Datenbankverbindung fehlt.",
  missing: "Ein Aufgabentitel ist erforderlich.",
  linked_delete: "Diese Aufgabe gehört zu einem Vereinsvorgang und kann nicht gelöscht werden. Nutze stattdessen den passenden Status.",
};

const statusLabels: Record<string, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  blocked: "Blockiert",
  done: "Erledigt",
};

const priorityLabels: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};

export const dynamic = "force-dynamic";

function formatDate(value: unknown) {
  if (!value) return "Keine Frist";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "Keine Frist"
    : new Intl.DateTimeFormat("de-DE").format(date);
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string; saved?:string }>;
}) {
  const actor = await requirePermission("tasks.read");
  const sql = getDb();
  const params = await searchParams;

  const [tasks, members, counts] = sql
    ? await Promise.all([
        sql`
          SELECT
            t.id::text,
            t.title,
            t.description,
            t.category,
            t.status,
            t.priority,
            t.due_date,
            t.created_at,
            t.source_type,
            t.source_id::text,
            m.first_name,
            m.last_name,
            r.resolution_number,
            r.title AS resolution_title
          FROM tasks t
          LEFT JOIN members m ON m.id = t.owner_member_id
          LEFT JOIN resolutions r
            ON t.source_type='resolution'
           AND r.id=t.source_id
          WHERE t.status <> 'cancelled'
            AND t.deleted_at IS NULL
          ORDER BY
            CASE t.priority
              WHEN 'urgent' THEN 1
              WHEN 'high' THEN 2
              WHEN 'medium' THEN 3
              ELSE 4
            END,
            t.due_date NULLS LAST,
            t.created_at DESC
        `,
        sql`
          SELECT id::text, first_name, last_name
          FROM members
          WHERE status = 'active'
          ORDER BY last_name, first_name
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status = 'open')::int AS open,
            count(*) FILTER (WHERE priority IN ('high','urgent') AND status NOT IN ('done','cancelled'))::int AS high,
            count(*) FILTER (WHERE status = 'in_progress')::int AS progress,
            count(*) FILTER (
              WHERE status = 'done'
                AND completed_at >= date_trunc('year',CURRENT_DATE)
            )::int AS done
          FROM tasks
          WHERE deleted_at IS NULL
        `,
      ])
    : [[], [], [{ open: 0, high: 0, progress: 0, done: 0 }]];

  const count = counts[0] ?? {};
  const canWrite = hasPermission(actor.roles, "tasks.write");

  const columns = ["open", "in_progress", "blocked", "done"] as const;

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Aufgaben</h1>
          <p>Vorstandsaufgaben mit Verantwortlichen, Fristen, Prioritäten und Status.</p>
        </div>
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {params.created && <div className="form-success">Aufgabe wurde angelegt.</div>}
      {params.deleted && <div className="form-success">Aufgabe wurde in den Papierkorb verschoben.</div>}
      {params.saved && <div className="form-success">Aufgabe wurde aktualisiert.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Offen</span><strong>{Number(count.open ?? 0)}</strong><small>noch nicht begonnen</small></article>
        <article className="stat-card"><span>Hohe Priorität</span><strong>{Number(count.high ?? 0)}</strong><small>hoch oder dringend</small></article>
        <article className="stat-card"><span>In Arbeit</span><strong>{Number(count.progress ?? 0)}</strong><small>aktuell bearbeitet</small></article>
        <article className="stat-card"><span>Erledigt</span><strong>{Number(count.done ?? 0)}</strong><small>dieses Jahr</small></article>
      </section>

      {canWrite && (
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Neu</span><h2>Aufgabe anlegen</h2></div></div>
          <form action={createTaskAction} className="task-create-form">
            <label>Titel<input name="title" required placeholder="Was muss erledigt werden?" /></label>
            <label>Bereich<input name="category" placeholder="z. B. Material, Liga, Vorstand" /></label>
            <label>Verantwortlich
              <select name="ownerMemberId" defaultValue="">
                <option value="">Noch offen</option>
                {members.map((member) => (
                  <option value={String(member.id)} key={String(member.id)}>
                    {String(member.first_name)} {String(member.last_name)}
                  </option>
                ))}
              </select>
            </label>
            <label>Priorität
              <select name="priority" defaultValue="medium">
                <option value="low">Niedrig</option>
                <option value="medium">Mittel</option>
                <option value="high">Hoch</option>
                <option value="urgent">Dringend</option>
              </select>
            </label>
            <label>Frist<input name="dueDate" type="date" /></label>
            <label className="task-description">Beschreibung<textarea name="description" rows={2} /></label>
            <button className="primary-button" type="submit">Aufgabe speichern</button>
          </form>
        </article>
      )}

      <section className="task-board">
        {columns.map((status) => {
          const items = tasks.filter((task) => task.status === status);
          return (
            <article className="task-column" key={status}>
              <div className="task-column-head">
                <h2>{statusLabels[status]}</h2>
                <span>{items.length}</span>
              </div>

              <div className="task-column-list">
                {items.length === 0 ? (
                  <div className="empty-state">Keine Aufgaben.</div>
                ) : items.map((task) => (
                  <div className="task-card" key={String(task.id)}>
                    <div className="task-card-top">
                      <span className={`task-priority priority-${task.priority}`}>
                        {priorityLabels[String(task.priority)] ?? String(task.priority)}
                      </span>
                      <span className="task-category">{task.category ? String(task.category) : "Allgemein"}</span>
                    </div>
                    <h3>{String(task.title)}</h3>
                    {task.source_type==="resolution" && task.source_id && (
                      <Link
                        href={"/beschluesse?q="+encodeURIComponent(String(task.resolution_number ?? task.resolution_title ?? ""))}
                        className="task-source-link"
                      >
                        <span>Aus Beschluss</span>
                        <strong>
                          {task.resolution_number ? String(task.resolution_number)+" · " : ""}
                          {task.resolution_title ? String(task.resolution_title) : "Beschluss öffnen"}
                        </strong>
                      </Link>
                    )}
                    {task.description && <p>{String(task.description)}</p>}
                    <div className="task-info">
                      <span>{task.first_name ? `${task.first_name} ${task.last_name}` : "Nicht zugewiesen"}</span>
                      <span>{formatDate(task.due_date)}</span>
                    </div>

                    {canWrite && (
                      <details className="task-edit-drawer">
                        <summary>Aufgabe bearbeiten</summary>
                        <form action={updateTaskDetailsAction} className="task-edit-form">
                          <input type="hidden" name="id" value={String(task.id)} />
                          <label>
                            Titel
                            <input name="title" defaultValue={String(task.title)} required />
                          </label>
                          <label>
                            Bereich
                            <input name="category" defaultValue={String(task.category ?? "")} />
                          </label>
                          <label>
                            Verantwortlich
                            <select
                              name="ownerMemberId"
                              defaultValue={
                                task.first_name
                                  ? String(
                                      members.find((member)=>
                                        String(member.first_name)===String(task.first_name) &&
                                        String(member.last_name)===String(task.last_name)
                                      )?.id ?? ""
                                    )
                                  : ""
                              }
                            >
                              <option value="">Noch offen</option>
                              {members.map((member)=>(
                                <option key={String(member.id)} value={String(member.id)}>
                                  {String(member.first_name)} {String(member.last_name)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Priorität
                            <select name="priority" defaultValue={String(task.priority)}>
                              <option value="low">Niedrig</option>
                              <option value="medium">Mittel</option>
                              <option value="high">Hoch</option>
                              <option value="urgent">Dringend</option>
                            </select>
                          </label>
                          <label>
                            Frist
                            <input
                              name="dueDate"
                              type="date"
                              defaultValue={task.due_date ? String(task.due_date).slice(0,10) : ""}
                            />
                          </label>
                          <label className="task-edit-description">
                            Beschreibung
                            <textarea
                              name="description"
                              rows={3}
                              defaultValue={String(task.description ?? "")}
                            />
                          </label>
                          <button className="mini-button">Änderungen speichern</button>
                        </form>
                      </details>
                    )}

                    {canWrite && (
                      <div className="task-actions">
                        {status !== "open" && (
                          <form action={updateTaskStatusAction}>
                            <input type="hidden" name="id" value={String(task.id)} />
                            <input type="hidden" name="status" value="open" />
                            <button className="mini-button">Offen</button>
                          </form>
                        )}
                        {status !== "in_progress" && (
                          <form action={updateTaskStatusAction}>
                            <input type="hidden" name="id" value={String(task.id)} />
                            <input type="hidden" name="status" value="in_progress" />
                            <button className="mini-button">In Arbeit</button>
                          </form>
                        )}
                        {status !== "blocked" && status !== "done" && (
                          <form action={updateTaskStatusAction}>
                            <input type="hidden" name="id" value={String(task.id)} />
                            <input type="hidden" name="status" value="blocked" />
                            <button className="mini-button">Blockiert</button>
                          </form>
                        )}
                        {status !== "done" && (
                          <form action={updateTaskStatusAction}>
                            <input type="hidden" name="id" value={String(task.id)} />
                            <input type="hidden" name="status" value="done" />
                            <button className="mini-button task-done-button">Erledigt</button>
                          </form>
                        )}
                        {!task.source_type && (
                          <form action={moveToTrashAction}>
                            <input type="hidden" name="type" value="task" />
                            <input type="hidden" name="id" value={String(task.id)} />
                            <ConfirmSubmitButton message={"Aufgabe „"+String(task.title)+"“ in den Papierkorb verschieben?"}>
                              Löschen
                            </ConfirmSubmitButton>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
