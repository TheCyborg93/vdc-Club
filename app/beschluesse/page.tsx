import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  createResolutionTaskAction,
  updateResolutionImplementationAction,
  updateResolutionStatusAction,
} from "@/app/beschluesse/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const statusLabels:Record<string,string>={
  open:"Offen",
  in_progress:"In Umsetzung",
  implemented:"Umgesetzt",
  withdrawn:"Aufgehoben",
};

const errorLabels:Record<string,string>={
  database:"Die Datenbank ist nicht verfügbar.",
  missing:"Der Beschluss wurde nicht gefunden.",
  withdrawn:"Ein aufgehobener Beschluss bleibt historisch abgeschlossen. Für eine neue Entscheidung bitte einen neuen Beschluss erfassen.",
};

export const dynamic="force-dynamic";

function formatDate(value:unknown) {
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

export default async function ResolutionsPage({
  searchParams,
}:{
  searchParams:Promise<{
    error?:string;
    task?:string;
    saved?:string;
    q?:string;
    status?:string;
    year?:string;
  }>;
}) {
  const actor=await requirePermission("resolutions.read");
  const sql=getDb();
  const params=await searchParams;

  const q=(params.q ?? "").trim();
  const status=["open","in_progress","implemented","withdrawn"].includes(params.status ?? "")
    ? String(params.status)
    : "";
  const yearNum=/^\d{4}$/.test(params.year ?? "") ? Number(params.year) : null;

  const [resolutions,counts,members,years]=sql
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
            r.implemented_at,
            r.implementation_notes,
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
          LEFT JOIN meetings m ON m.id=r.meeting_id
          LEFT JOIN agenda_items ai ON ai.id=r.agenda_item_id
          LEFT JOIN LATERAL (
            SELECT tx.*
            FROM tasks tx
            WHERE tx.source_type='resolution'
              AND tx.source_id=r.id
              AND tx.deleted_at IS NULL
            ORDER BY
              CASE WHEN tx.status='cancelled' THEN 1 ELSE 0 END,
              tx.created_at DESC
            LIMIT 1
          ) t ON true
          LEFT JOIN members owner ON owner.id=t.owner_member_id
          WHERE
            (${q}='' OR
              COALESCE(r.resolution_number,'') ILIKE '%' || ${q} || '%' OR
              r.title ILIKE '%' || ${q} || '%' OR
              r.decision_text ILIKE '%' || ${q} || '%' OR
              COALESCE(r.implementation_notes,'') ILIKE '%' || ${q} || '%')
            AND (${status}='' OR r.status=${status})
            AND (${yearNum}::int IS NULL OR EXTRACT(YEAR FROM r.decided_at)::int=${yearNum}::int)
          ORDER BY r.decided_at DESC,r.resolution_number DESC
        `,
        sql`
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE status='implemented')::int AS implemented,
            count(*) FILTER (WHERE status='in_progress')::int AS progress,
            count(*) FILTER (WHERE status='open')::int AS open,
            count(*) FILTER (WHERE status='withdrawn')::int AS withdrawn
          FROM resolutions
          WHERE
            (${q}='' OR
              COALESCE(resolution_number,'') ILIKE '%' || ${q} || '%' OR
              title ILIKE '%' || ${q} || '%' OR
              decision_text ILIKE '%' || ${q} || '%' OR
              COALESCE(implementation_notes,'') ILIKE '%' || ${q} || '%')
            AND (${yearNum}::int IS NULL OR EXTRACT(YEAR FROM decided_at)::int=${yearNum}::int)
        `,
        sql`
          SELECT id::text,first_name,last_name
          FROM members
          WHERE status='active'
          ORDER BY last_name,first_name
        `,
        sql`
          SELECT DISTINCT EXTRACT(YEAR FROM decided_at)::int AS year
          FROM resolutions
          ORDER BY year DESC
        `,
      ])
    : [[],[{total:0,implemented:0,progress:0,open:0,withdrawn:0}],[],[]];

  const count=counts[0] ?? {};
  const canWrite=hasPermission(actor.roles,"resolutions.write");
  const canCreateTasks=hasPermission(actor.roles,"tasks.write");

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Beschlüsse</h1>
          <p>Beschlussbuch mit Abstimmung, Herkunft, Folgeaufgabe und dokumentierter Umsetzung.</p>
        </div>
        <a href="/api/export/beschluesse" className="ghost-button">CSV Export</a>
      </section>

      {params.error && (
        <div className="form-error">
          {errorLabels[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}
        </div>
      )}
      {params.task && <div className="form-success">Folgeaufgabe wurde angelegt.</div>}
      {params.saved && <div className="form-success">Beschluss wurde aktualisiert.</div>}

      <section className="stat-grid">
        <article className="stat-card">
          <span>Beschlüsse</span>
          <strong>{Number(count.total ?? 0)}</strong>
          <small>{yearNum ? "im Jahr "+String(yearNum) : "im gewählten Bereich"}</small>
        </article>
        <article className="stat-card">
          <span>Umgesetzt</span>
          <strong>{Number(count.implemented ?? 0)}</strong>
          <small>abgeschlossen</small>
        </article>
        <article className="stat-card">
          <span>In Umsetzung</span>
          <strong>{Number(count.progress ?? 0)}</strong>
          <small>laufend</small>
        </article>
        <article className="stat-card">
          <span>Offen</span>
          <strong>{Number(count.open ?? 0)}</strong>
          <small>noch ohne Abschluss</small>
        </article>
      </section>

      <article className="panel resolution-filter-panel">
        <form method="get" className="resolution-filter-form">
          <label>
            Suche
            <input
              name="q"
              defaultValue={q}
              placeholder="Nummer, Titel, Beschlusstext oder Umsetzungsnotiz"
            />
          </label>
          <label>
            Jahr
            <select name="year" defaultValue={yearNum ? String(yearNum) : ""}>
              <option value="">Alle Jahre</option>
              {years.map((row)=>(
                <option key={String(row.year)} value={String(row.year)}>
                  {String(row.year)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">Alle Status</option>
              <option value="open">Offen</option>
              <option value="in_progress">In Umsetzung</option>
              <option value="implemented">Umgesetzt</option>
              <option value="withdrawn">Aufgehoben</option>
            </select>
          </label>
          <button className="mini-button">Filtern</button>
          {(q || yearNum || status) && (
            <Link href="/beschluesse" className="mini-button">Zurücksetzen</Link>
          )}
        </form>
      </article>

      <section className="resolution-register">
        {resolutions.length===0 ? (
          <article className="panel">
            <div className="empty-state">Keine Beschlüsse für diesen Filter gefunden.</div>
          </article>
        ) : resolutions.map((resolution)=>(
          <article className="resolution-card" key={String(resolution.id)}>
            <div className="resolution-card-number">
              <span>Beschluss</span>
              <strong>
                {resolution.resolution_number ? String(resolution.resolution_number) : "ohne Nr."}
              </strong>
              <small>{formatDate(resolution.decided_at)}</small>
            </div>

            <div className="resolution-card-body">
              <div className="resolution-card-head">
                <div>
                  <h2>{String(resolution.title)}</h2>
                  {resolution.meeting_id && (
                    <Link href={"/sitzungen/"+String(resolution.meeting_id)}>
                      {String(resolution.meeting_title)}
                      {resolution.agenda_position
                        ? " · TOP "+String(resolution.agenda_position)
                        : ""}
                    </Link>
                  )}
                </div>
                <b className={"resolution-status resolution-status-"+String(resolution.status)}>
                  {statusLabels[String(resolution.status)] ?? String(resolution.status)}
                </b>
              </div>

              <p className="resolution-text">{String(resolution.decision_text)}</p>

              <div className="resolution-meta-grid">
                <div><span>Ja</span><strong>{Number(resolution.votes_yes)}</strong></div>
                <div><span>Nein</span><strong>{Number(resolution.votes_no)}</strong></div>
                <div><span>Enthaltung</span><strong>{Number(resolution.votes_abstain)}</strong></div>
                <div>
                  <span>Umgesetzt am</span>
                  <strong>{resolution.implemented_at ? formatDate(resolution.implemented_at) : "–"}</strong>
                </div>
              </div>

              {resolution.implementation_notes && (
                <div className="resolution-implementation-note">
                  <span className="eyebrow">Umsetzungsnotiz</span>
                  <p>{String(resolution.implementation_notes)}</p>
                </div>
              )}

              {resolution.task_id ? (
                <div className="resolution-task-box">
                  <div>
                    <span className="eyebrow">Folgeaufgabe</span>
                    <strong>{String(resolution.task_title)}</strong>
                    <small>
                      {resolution.owner_first_name
                        ? String(resolution.owner_first_name)+" "+String(resolution.owner_last_name)
                        : "Nicht zugewiesen"}
                      {resolution.task_due_date
                        ? " · Frist "+formatDate(resolution.task_due_date)
                        : ""}
                    </small>
                  </div>
                  <div className="resolution-task-actions">
                    <b className={"status-badge status-"+String(resolution.task_status)}>
                      {String(resolution.task_status)}
                    </b>
                    <Link href="/aufgaben" className="mini-button">Aufgaben öffnen</Link>
                  </div>
                </div>
              ) : canCreateTasks && !["implemented","withdrawn"].includes(String(resolution.status)) ? (
                <details className="resolution-task-create">
                  <summary>Folgeaufgabe anlegen</summary>
                  <form action={createResolutionTaskAction} className="form-stack">
                    <input type="hidden" name="resolutionId" value={String(resolution.id)} />
                    <label>
                      Titel
                      <input
                        name="title"
                        defaultValue={"Beschluss umsetzen: "+String(resolution.title)}
                        required
                      />
                    </label>
                    <label>
                      Beschreibung
                      <textarea
                        name="description"
                        rows={3}
                        defaultValue={String(resolution.decision_text)}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Verantwortlich
                        <select name="ownerMemberId" defaultValue="">
                          <option value="">Noch offen</option>
                          {members.map((member)=>(
                            <option key={String(member.id)} value={String(member.id)}>
                              {String(member.first_name)} {String(member.last_name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Frist<input name="dueDate" type="date" /></label>
                    </div>
                    <button className="primary-button">Aufgabe anlegen</button>
                  </form>
                </details>
              ) : null}

              {canWrite && (
                <details className="resolution-implementation-edit">
                  <summary>Umsetzungsnotiz bearbeiten</summary>
                  <form action={updateResolutionImplementationAction} className="form-stack">
                    <input type="hidden" name="id" value={String(resolution.id)} />
                    <label>
                      Notiz
                      <textarea
                        name="implementationNotes"
                        rows={3}
                        defaultValue={
                          resolution.implementation_notes
                            ? String(resolution.implementation_notes)
                            : ""
                        }
                        placeholder="Was wurde umgesetzt, wann und mit welchem Ergebnis?"
                      />
                    </label>
                    <button className="mini-button">Notiz speichern</button>
                  </form>
                </details>
              )}

              {canWrite && resolution.status!=="withdrawn" && (
                <div className="resolution-actions">
                  {resolution.status!=="open" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                      <input type="hidden" name="status" value="open" />
                      <button className="mini-button">Offen</button>
                    </form>
                  )}

                  {resolution.status!=="in_progress" && resolution.status!=="implemented" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                      <input type="hidden" name="status" value="in_progress" />
                      <button className="mini-button">In Umsetzung</button>
                    </form>
                  )}

                  {resolution.status!=="implemented" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                      <input type="hidden" name="status" value="implemented" />
                      <button className="mini-button task-done-button">Umgesetzt</button>
                    </form>
                  )}

                  <form action={updateResolutionStatusAction}>
                    <input type="hidden" name="id" value={String(resolution.id)} />
                    <input type="hidden" name="status" value="withdrawn" />
                    <ConfirmSubmitButton
                      message={
                        "Beschluss „"+
                        String(resolution.resolution_number ?? resolution.title)+
                        "“ wirklich aufheben? Eine offene Folgeaufgabe wird abgebrochen."
                      }
                    >
                      Aufheben
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
