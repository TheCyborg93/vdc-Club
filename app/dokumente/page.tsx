import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  archiveDocumentAction,
  createDocumentAction,
  updateDocumentStatusAction,
} from "@/app/dokumente/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic = "force-dynamic";

const statusLabels: Record<string,string> = {
  active:"Aktiv",
  review:"Zu prüfen",
  archived:"Archiviert",
  expired:"Abgelaufen",
};

function formatDate(value: unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(date);
}

function formatBytes(value: unknown) {
  const bytes=Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes<=0) return "";
  if (bytes<1024) return bytes+" B";
  if (bytes<1024*1024) return (bytes/1024).toLocaleString("de-DE",{maximumFractionDigits:1})+" KB";
  return (bytes/(1024*1024)).toLocaleString("de-DE",{maximumFractionDigits:1})+" MB";
}

const errorLabels: Record<string,string> = {
  database:"Die Datenbank ist nicht verfügbar.",
  missing:"Titel und Kategorie sind erforderlich.",
  invalid:"Der hinterlegte externe Link ist ungültig.",
  source:"Bitte entweder eine Datei hochladen oder einen externen Link verwenden – nicht beides.",
  empty:"Die ausgewählte Datei ist leer.",
  size:"Die Datei ist zu groß. Maximal erlaubt sind 4 MB.",
  type:"Dieser Dateityp ist nicht erlaubt.",
  storage:"Der private Dokumentenspeicher ist noch nicht konfiguriert.",
  upload:"Die Datei konnte nicht in den privaten Speicher hochgeladen werden.",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?:string;
    created?:string;
    archived?:string;
    uploaded?:string;
    deleted?:string;
    q?:string;
    category?:string;
    status?:string;
  }>;
}) {
  const actor=await requirePermission("documents.read");
  const sql=getDb();
  const params=await searchParams;
  const canWrite=hasPermission(actor.roles,"documents.write");
  const q=(params.q ?? "").trim();
  const category=(params.category ?? "").trim();
  const status=(params.status ?? "").trim();

  const [documents,counts,members,meetings,resolutions,financeEntries,sponsors,categories]=sql
    ? await Promise.all([
        sql`
          SELECT
            d.id::text,d.title,d.category,d.storage_type,d.storage_ref,d.status,
            d.document_date,d.valid_until,d.review_on,d.notes,d.created_at,
            d.original_filename,d.file_size_bytes,d.mime_type,d.uploaded_at,d.current_version_number,
            m.first_name,m.last_name,
            mt.id::text AS meeting_id,mt.title AS meeting_title,
            r.resolution_number,r.title AS resolution_title,
            f.description AS finance_description,
            s.name AS sponsor_name
          FROM documents d
          LEFT JOIN members m ON m.id=d.member_id
          LEFT JOIN meetings mt ON mt.id=d.meeting_id
          LEFT JOIN resolutions r ON r.id=d.resolution_id
          LEFT JOIN finance_entries f ON f.id=d.finance_entry_id
          LEFT JOIN sponsors s ON s.id=d.sponsor_id
          WHERE d.status<>'archived'
            AND d.deleted_at IS NULL
            AND (${q}='' OR d.title ILIKE '%' || ${q} || '%' OR COALESCE(d.notes,'') ILIKE '%' || ${q} || '%')
            AND (${category}='' OR d.category=${category})
            AND (${status}='' OR d.status=${status})
          ORDER BY
            CASE
              WHEN d.status='review' THEN 0
              WHEN d.review_on IS NOT NULL AND d.review_on<=CURRENT_DATE+interval '30 days' THEN 1
              WHEN d.valid_until IS NOT NULL AND d.valid_until<=CURRENT_DATE+interval '30 days' THEN 2
              ELSE 3
            END,
            COALESCE(d.document_date,d.created_at::date) DESC,
            d.created_at DESC
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status<>'archived')::int AS total,
            count(*) FILTER (WHERE category='Protokoll' AND status<>'archived')::int AS minutes,
            count(*) FILTER (WHERE category='Vertrag' AND status='active')::int AS contracts,
            count(*) FILTER (
              WHERE status='review'
                 OR (review_on IS NOT NULL AND review_on<=CURRENT_DATE+interval '30 days' AND status='active')
                 OR (valid_until IS NOT NULL AND valid_until<=CURRENT_DATE+interval '30 days' AND status='active')
            )::int AS review,
            count(*) FILTER (WHERE status='archived')::int AS archived
          FROM documents
          WHERE deleted_at IS NULL
        `,
        sql`SELECT id::text,first_name,last_name FROM members WHERE status='active' ORDER BY last_name,first_name`,
        sql`SELECT id::text,title,starts_at FROM meetings WHERE deleted_at IS NULL ORDER BY starts_at DESC LIMIT 40`,
        sql`SELECT id::text,resolution_number,title FROM resolutions ORDER BY decided_at DESC LIMIT 60`,
        sql`SELECT id::text,booked_on,description FROM finance_entries WHERE status='booked' ORDER BY booked_on DESC LIMIT 60`,
        sql`SELECT id::text,name FROM sponsors WHERE deleted_at IS NULL ORDER BY name`,
        sql`SELECT DISTINCT category FROM documents WHERE deleted_at IS NULL ORDER BY category`,
      ])
    : [[],[{total:0,minutes:0,contracts:0,review:0,archived:0}],[],[],[],[],[],[]];

  const c=counts[0] ?? {};

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Vorstandsarbeit</span>
          <h1>Dokumente</h1>
          <p>Satzung, Protokolle, Verträge und Vereinsunterlagen mit Fristen und Verknüpfungen verwalten.</p>
        </div>
        <Link href="/archiv" className="ghost-button">Archiv · {Number(c.archived ?? 0)}</Link>
      </section>

      {params.error && <div className="form-error">{errorLabels[params.error] ?? "Das Dokument konnte nicht gespeichert werden."}</div>}
      {(params.created || params.archived) && <div className="form-success">Dokumentenregister wurde aktualisiert.</div>}
      {params.uploaded && <div className="form-success">Datei wurde sicher hochgeladen und im Dokumentenregister gespeichert.</div>}
      {params.deleted && <div className="form-success">Dokument wurde in den Papierkorb verschoben.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Dokumente</span><strong>{Number(c.total ?? 0)}</strong><small>aktive Ablage</small></article>
        <article className="stat-card"><span>Protokolle</span><strong>{Number(c.minutes ?? 0)}</strong><small>registriert</small></article>
        <article className="stat-card"><span>Verträge</span><strong>{Number(c.contracts ?? 0)}</strong><small>aktiv</small></article>
        <article className="stat-card"><span>Zu prüfen</span><strong>{Number(c.review ?? 0)}</strong><small>Status oder Frist</small></article>
      </section>

      <article className="panel document-filter-panel">
        <form method="get" className="document-filter-form">
          <label>Suche<input name="q" defaultValue={q} placeholder="Titel oder Notiz" /></label>
          <label>Kategorie
            <select name="category" defaultValue={category}>
              <option value="">Alle</option>
              {categories.map((row)=><option key={String(row.category)} value={String(row.category)}>{String(row.category)}</option>)}
            </select>
          </label>
          <label>Status
            <select name="status" defaultValue={status}>
              <option value="">Alle</option>
              <option value="active">Aktiv</option>
              <option value="review">Zu prüfen</option>
              <option value="expired">Abgelaufen</option>
            </select>
          </label>
          <button className="mini-button">Filtern</button>
          {(q || category || status) && <Link href="/dokumente" className="mini-button">Zurücksetzen</Link>}
        </form>
      </article>

      <section className={canWrite ? "management-grid" : "management-grid single"}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Ablage</span><h2>Dokumentenregister</h2></div>
            <span className="count-chip">{documents.length}</span>
          </div>

          <div className="document-list">
            {documents.length===0 ? (
              <div className="empty-state">Keine Dokumente für diesen Filter.</div>
            ) : documents.map((doc)=>(
              <article className="document-row" key={String(doc.id)}>
                <div className="document-icon">{doc.category==="Protokoll" ? "PRO" : doc.category==="Vertrag" ? "VER" : "DOC"}</div>
                <div className="document-main">
                  <div className="document-title-row">
                    <Link href={"/dokumente/"+String(doc.id)} className="document-title-link">
                      <strong>{String(doc.title)}</strong>
                    </Link>
                    <div className="document-title-meta">
                      <span className="document-version-chip">v{Number(doc.current_version_number ?? 1)}</span>
                      <span className={`document-status document-${doc.status}`}>
                        {statusLabels[String(doc.status)] ?? String(doc.status)}
                      </span>
                    </div>
                  </div>
                  <span>
                    {String(doc.category)}
                    {" · "}{doc.document_date ? formatDate(doc.document_date) : `angelegt ${formatDate(doc.created_at)}`}
                  </span>
                  <div className="document-deadlines">
                    {doc.review_on && <small>Prüfen am {formatDate(doc.review_on)}</small>}
                    {doc.valid_until && <small>Gültig bis {formatDate(doc.valid_until)}</small>}
                    {doc.storage_type==="upload" && doc.original_filename && (
                      <small className="document-file-chip">
                        Datei: {String(doc.original_filename)}
                        {doc.file_size_bytes ? " · "+formatBytes(doc.file_size_bytes) : ""}
                      </small>
                    )}
                  </div>
                  <div className="document-links">
                    {doc.meeting_title && <span>Sitzung: {String(doc.meeting_title)}</span>}
                    {doc.resolution_number && <span>Beschluss: {String(doc.resolution_number)}</span>}
                    {doc.first_name && <span>Mitglied: {String(doc.first_name)} {String(doc.last_name)}</span>}
                    {doc.sponsor_name && <span>Sponsor: {String(doc.sponsor_name)}</span>}
                    {doc.finance_description && <span>Finanzen: {String(doc.finance_description)}</span>}
                  </div>
                  {doc.notes && <p>{String(doc.notes)}</p>}
                </div>

                <div className="document-actions">
                  <Link href={"/dokumente/"+String(doc.id)} className="mini-button">Details</Link>
                  {doc.storage_ref && (
                    doc.storage_type==="upload"
                      ? (
                        <>
                          <Link href={"/api/documents/"+String(doc.id)+"/file"} target="_blank" className="mini-button">Datei öffnen</Link>
                          <Link href={"/api/documents/"+String(doc.id)+"/file?download=1"} className="mini-button">Download</Link>
                        </>
                      )
                      : doc.storage_type==="internal"
                        ? <Link href={String(doc.storage_ref)} className="mini-button">Öffnen</Link>
                        : <a href={String(doc.storage_ref)} target="_blank" rel="noreferrer" className="mini-button">Öffnen</a>
                  )}
                  {canWrite && (
                    <>
                      <form action={updateDocumentStatusAction}>
                        <input type="hidden" name="id" value={String(doc.id)} />
                        <select name="status" defaultValue={String(doc.status)}>
                          <option value="active">Aktiv</option>
                          <option value="review">Zu prüfen</option>
                          <option value="expired">Abgelaufen</option>
                        </select>
                        <button className="mini-button">Status</button>
                      </form>
                      <form action={archiveDocumentAction}>
                        <input type="hidden" name="id" value={String(doc.id)} />
                        <button className="mini-button">Archivieren</button>
                      </form>
                      <form action={moveToTrashAction}>
                        <input type="hidden" name="type" value="document" />
                        <input type="hidden" name="id" value={String(doc.id)} />
                        <ConfirmSubmitButton message={"Dokument „"+String(doc.title)+"“ in den Papierkorb verschieben?"}>
                          Löschen
                        </ConfirmSubmitButton>
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
            <div className="panel-head"><div><span className="eyebrow">Neu</span><h2>Dokument registrieren</h2></div></div>
            <form action={createDocumentAction} className="form-stack" encType="multipart/form-data">
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
              <div className="document-upload-box">
                <span className="eyebrow">Datei hochladen</span>
                <label>
                  Datei
                  <input
                    name="file"
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.jpg,.jpeg,.png,.webp"
                  />
                </label>
                <small>Max. 4 MB · PDF, Office, OpenDocument, TXT und gängige Bilder.</small>
              </div>
              <div className="document-source-divider"><span>ODER</span></div>
              <label>Externer Link<input name="storageRef" type="url" placeholder="https://…" /></label>
              <div className="form-grid">
                <label>Dokumentdatum<input name="documentDate" type="date" /></label>
                <label>Prüfen am<input name="reviewOn" type="date" /></label>
              </div>
              <label>Gültig bis<input name="validUntil" type="date" /></label>
              <label>Mitglied
                <select name="memberId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {members.map((m)=><option key={String(m.id)} value={String(m.id)}>{String(m.first_name)} {String(m.last_name)}</option>)}
                </select>
              </label>
              <label>Sponsor
                <select name="sponsorId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {sponsors.map((s)=><option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
                </select>
              </label>
              <label>Sitzung
                <select name="meetingId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {meetings.map((m)=><option key={String(m.id)} value={String(m.id)}>{String(m.title)} · {formatDate(m.starts_at)}</option>)}
                </select>
              </label>
              <label>Beschluss
                <select name="resolutionId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {resolutions.map((r)=><option key={String(r.id)} value={String(r.id)}>{String(r.resolution_number ?? "")} {String(r.title)}</option>)}
                </select>
              </label>
              <label>Finanzbuchung
                <select name="financeEntryId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {financeEntries.map((f)=><option key={String(f.id)} value={String(f.id)}>{formatDate(f.booked_on)} · {String(f.description)}</option>)}
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
