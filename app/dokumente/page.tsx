import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  createDocumentAction,
  deleteDocumentAction,
  updateDocumentStatusAction,
} from "@/app/dokumente/actions";

export const dynamic = "force-dynamic";

const statusLabels: Record<string,string> = {
  active: "Aktiv",
  review: "Zu prüfen",
  archived: "Archiviert",
  expired: "Abgelaufen",
};

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(date);
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string }>;
}) {
  const actor = await requirePermission("documents.read");
  const sql = getDb();
  const params = await searchParams;
  const canWrite = hasPermission(actor.roles, "documents.write");

  const [documents, counts, members, meetings, resolutions, financeEntries] = sql
    ? await Promise.all([
        sql`
          SELECT
            d.id::text,
            d.title,
            d.category,
            d.storage_ref,
            d.status,
            d.valid_until,
            d.notes,
            d.created_at,
            m.first_name,
            m.last_name,
            mt.title AS meeting_title,
            r.resolution_number,
            r.title AS resolution_title,
            f.description AS finance_description
          FROM documents d
          LEFT JOIN members m ON m.id = d.member_id
          LEFT JOIN meetings mt ON mt.id = d.meeting_id
          LEFT JOIN resolutions r ON r.id = d.resolution_id
          LEFT JOIN finance_entries f ON f.id = d.finance_entry_id
          ORDER BY
            CASE d.status WHEN 'review' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
            d.created_at DESC
        `,
        sql`
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE category = 'Protokoll')::int AS minutes,
            count(*) FILTER (WHERE category = 'Vertrag' AND status = 'active')::int AS contracts,
            count(*) FILTER (
              WHERE status = 'review'
                 OR (valid_until IS NOT NULL AND valid_until <= CURRENT_DATE + interval '30 days' AND status = 'active')
            )::int AS review
          FROM documents
        `,
        sql`SELECT id::text, first_name, last_name FROM members WHERE status = 'active' ORDER BY last_name, first_name`,
        sql`SELECT id::text, title, starts_at FROM meetings ORDER BY starts_at DESC LIMIT 30`,
        sql`SELECT id::text, resolution_number, title FROM resolutions ORDER BY decided_at DESC LIMIT 50`,
        sql`SELECT id::text, booked_on, description FROM finance_entries WHERE status = 'booked' ORDER BY booked_on DESC LIMIT 50`,
      ])
    : [[], [{ total:0, minutes:0, contracts:0, review:0 }], [], [], [], []];

  const c = counts[0] ?? {};

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Dokumente</h1>
          <p>Satzung, Protokolle, Verträge, Angebote und Vereinsunterlagen mit ihren Zusammenhängen verwalten.</p>
        </div>
      </section>

      {params.error && <div className="form-error">Das Dokument konnte nicht gespeichert werden.</div>}
      {(params.created || params.deleted) && <div className="form-success">Dokumentenablage wurde aktualisiert.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Dokumente</span><strong>{Number(c.total ?? 0)}</strong><small>gesamt</small></article>
        <article className="stat-card"><span>Protokolle</span><strong>{Number(c.minutes ?? 0)}</strong><small>hinterlegt</small></article>
        <article className="stat-card"><span>Verträge</span><strong>{Number(c.contracts ?? 0)}</strong><small>aktiv</small></article>
        <article className="stat-card"><span>Zu prüfen</span><strong>{Number(c.review ?? 0)}</strong><small>Status oder Frist</small></article>
      </section>

      <section className={canWrite ? "management-grid" : "management-grid single"}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Ablage</span><h2>Dokumentenregister</h2></div>
            <span className="count-chip">{documents.length}</span>
          </div>

          <div className="document-list">
            {documents.length === 0 ? (
              <div className="empty-state">Noch keine Dokumente hinterlegt.</div>
            ) : documents.map((doc) => (
              <article className="document-row" key={String(doc.id)}>
                <div className="document-icon">DOC</div>
                <div className="document-main">
                  <div className="document-title-row">
                    <strong>{String(doc.title)}</strong>
                    <span className={`document-status document-${doc.status}`}>
                      {statusLabels[String(doc.status)] ?? String(doc.status)}
                    </span>
                  </div>
                  <span>{String(doc.category)} · angelegt {formatDate(doc.created_at)}</span>
                  {doc.valid_until && <small>Gültig bis {formatDate(doc.valid_until)}</small>}
                  <div className="document-links">
                    {doc.meeting_title && <span>Sitzung: {String(doc.meeting_title)}</span>}
                    {doc.resolution_number && <span>Beschluss: {String(doc.resolution_number)}</span>}
                    {doc.first_name && <span>Mitglied: {String(doc.first_name)} {String(doc.last_name)}</span>}
                    {doc.finance_description && <span>Finanzen: {String(doc.finance_description)}</span>}
                  </div>
                  {doc.notes && <p>{String(doc.notes)}</p>}
                </div>

                <div className="document-actions">
                  {doc.storage_ref && (
                    <a href={String(doc.storage_ref)} target="_blank" rel="noreferrer" className="mini-button">Öffnen</a>
                  )}
                  {canWrite && (
                    <>
                      <form action={updateDocumentStatusAction}>
                        <input type="hidden" name="id" value={String(doc.id)} />
                        <select name="status" defaultValue={String(doc.status)}>
                          <option value="active">Aktiv</option>
                          <option value="review">Zu prüfen</option>
                          <option value="archived">Archiviert</option>
                          <option value="expired">Abgelaufen</option>
                        </select>
                        <button className="mini-button">Speichern</button>
                      </form>
                      <form action={deleteDocumentAction}>
                        <input type="hidden" name="id" value={String(doc.id)} />
                        <button className="mini-button">Löschen</button>
                      </form>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </article>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head"><div><span className="eyebrow">Neu</span><h2>Dokument hinterlegen</h2></div></div>
            <form action={createDocumentAction} className="form-stack">
              <label>Titel<input name="title" required /></label>
              <label>Kategorie
                <select name="category" defaultValue="Allgemein">
                  <option>Allgemein</option>
                  <option>Protokoll</option>
                  <option>Vertrag</option>
                  <option>Finanzen</option>
                  <option>Satzung</option>
                  <option>Sponsor</option>
                  <option>Mitglied</option>
                  <option>Angebot</option>
                </select>
              </label>
              <label>Link / Datei-Referenz<input name="storageRef" type="url" placeholder="https://…" /></label>
              <label>Gültig bis<input name="validUntil" type="date" /></label>
              <label>Mitglied
                <select name="memberId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {members.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.first_name)} {String(m.last_name)}</option>)}
                </select>
              </label>
              <label>Sitzung
                <select name="meetingId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {meetings.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.title)} · {formatDate(m.starts_at)}</option>)}
                </select>
              </label>
              <label>Beschluss
                <select name="resolutionId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {resolutions.map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.resolution_number ?? "")} {String(r.title)}</option>)}
                </select>
              </label>
              <label>Finanzbuchung
                <select name="financeEntryId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {financeEntries.map((f) => <option key={String(f.id)} value={String(f.id)}>{formatDate(f.booked_on)} · {String(f.description)}</option>)}
                </select>
              </label>
              <label>Notiz<textarea name="notes" rows={3} /></label>
              <button className="primary-button">Dokument speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
