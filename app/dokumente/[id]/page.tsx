import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  replaceDocumentVersionAction,
  updateDocumentMetadataAction,
} from "@/app/dokumente/[id]/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic="force-dynamic";

const statusLabels:Record<string,string>={
  active:"Aktiv",
  review:"Zu prüfen",
  expired:"Abgelaufen",
  archived:"Archiviert",
};

const errorLabels:Record<string,string>={
  database:"Die Datenbank ist nicht verfügbar.",
  missing:"Pflichtangaben fehlen oder das Dokument wurde nicht gefunden.",
  source:"Bitte entweder eine Datei oder einen externen Link als neue Version angeben.",
  invalid:"Der externe Link ist ungültig.",
  empty:"Die ausgewählte Datei ist leer.",
  size:"Die Datei ist zu groß. Maximal erlaubt sind 4 MB.",
  type:"Dieser Dateityp ist nicht erlaubt.",
  storage:"Der private Dokumentenspeicher ist nicht verfügbar.",
  upload:"Die neue Datei konnte nicht hochgeladen werden.",
  protected_source:"Automatisch erzeugte interne Protokolle können nicht durch eine Datei ersetzt werden.",
};

function formatDate(value:unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(date);
}

function formatDateTime(value:unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE",{
        dateStyle:"medium",
        timeStyle:"short",
        timeZone:"Europe/Berlin",
      }).format(date);
}

function dateInput(value:unknown) {
  if (!value) return "";
  return String(value).slice(0,10);
}

function formatBytes(value:unknown) {
  const bytes=Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes<=0) return "–";
  if (bytes<1024) return bytes+" B";
  if (bytes<1024*1024) {
    return (bytes/1024).toLocaleString("de-DE",{maximumFractionDigits:1})+" KB";
  }
  return (bytes/(1024*1024)).toLocaleString("de-DE",{maximumFractionDigits:1})+" MB";
}

export default async function DocumentDetailPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{saved?:string;version?:string;error?:string}>;
}) {
  const actor=await requirePermission("documents.read");
  const sql=getDb();
  const {id}=await params;
  const query=await searchParams;
  const canWrite=hasPermission(actor.roles,"documents.write");

  if (!sql) {
    return <div className="form-error">Die Datenbank ist nicht verfügbar.</div>;
  }

  const [
    documentRows,
    versions,
    members,
    meetings,
    resolutions,
    financeEntries,
    sponsors,
  ]=await Promise.all([
    sql`
      SELECT
        d.*,
        m.first_name,m.last_name,
        mt.title AS meeting_title,
        r.resolution_number,r.title AS resolution_title,
        f.description AS finance_description,
        s.name AS sponsor_name,
        uploader.display_name AS uploader_name
      FROM documents d
      LEFT JOIN members m ON m.id=d.member_id
      LEFT JOIN meetings mt ON mt.id=d.meeting_id
      LEFT JOIN resolutions r ON r.id=d.resolution_id
      LEFT JOIN finance_entries f ON f.id=d.finance_entry_id
      LEFT JOIN sponsors s ON s.id=d.sponsor_id
      LEFT JOIN app_users uploader ON uploader.id=d.uploaded_by
      WHERE d.id=${id}::uuid
        AND d.deleted_at IS NULL
      LIMIT 1
    `,
    sql`
      SELECT
        v.id::text,v.version_number,v.storage_type,v.storage_ref,v.mime_type,
        v.original_filename,v.file_size_bytes,v.checksum_sha256,
        v.created_at,v.replaced_at,v.change_note,
        u.display_name AS creator_name
      FROM document_versions v
      LEFT JOIN app_users u ON u.id=v.created_by
      WHERE v.document_id=${id}::uuid
      ORDER BY v.version_number DESC
    `,
    sql`
      SELECT id::text,first_name,last_name,status
      FROM members
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'passive' THEN 1 ELSE 2 END,
        last_name,first_name
    `,
    sql`
      SELECT id::text,title,starts_at
      FROM meetings
      WHERE deleted_at IS NULL
      ORDER BY starts_at DESC
      LIMIT 80
    `,
    sql`
      SELECT id::text,resolution_number,title
      FROM resolutions
      ORDER BY decided_at DESC
      LIMIT 100
    `,
    sql`
      SELECT id::text,booked_on,description
      FROM finance_entries
      WHERE status='booked'
      ORDER BY booked_on DESC
      LIMIT 100
    `,
    sql`
      SELECT id::text,name
      FROM sponsors
      WHERE deleted_at IS NULL
      ORDER BY name
    `,
  ]);

  const doc=documentRows[0];
  if (!doc) notFound();

  const canReplace=canWrite && doc.storage_type!=="internal" && doc.status!=="archived";

  const currentSource=(
    <>
      {doc.storage_type==="upload" && doc.storage_ref && (
        <div className="document-current-actions">
          <Link href={"/api/documents/"+id+"/file"} target="_blank" className="primary-button">Datei öffnen</Link>
          <Link href={"/api/documents/"+id+"/file?download=1"} className="ghost-button">Download</Link>
        </div>
      )}
      {doc.storage_type==="link" && doc.storage_ref && (
        <div className="document-current-actions">
          <a href={String(doc.storage_ref)} target="_blank" rel="noreferrer" className="primary-button">Extern öffnen</a>
        </div>
      )}
      {doc.storage_type==="internal" && doc.storage_ref && (
        <div className="document-current-actions">
          <Link href={String(doc.storage_ref)} className="primary-button">Intern öffnen</Link>
        </div>
      )}
      {doc.storage_type==="record" && (
        <span className="document-no-file">Aktuell ist keine Datei oder externer Link hinterlegt.</span>
      )}
    </>
  );

  return (
    <div className="page-stack document-detail-page">
      <section className="page-heading">
        <div>
          <Link href="/dokumente" className="back-link">← Dokumente</Link>
          <span className="eyebrow">{String(doc.category)}</span>
          <h1>{String(doc.title)}</h1>
          <p>Dokumentdetails, Verknüpfungen und Versionshistorie.</p>
        </div>
        <span className={"document-status document-"+String(doc.status)}>
          {statusLabels[String(doc.status)] ?? String(doc.status)}
        </span>
      </section>

      {query.saved && <div className="form-success">Dokumentdaten wurden gespeichert.</div>}
      {query.version && <div className="form-success">Neue Dokumentversion wurde hinterlegt. Der vorherige Stand bleibt erhalten.</div>}
      {query.error && <div className="form-error">{errorLabels[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}

      <section className="document-detail-summary">
        <article className="panel document-current-card">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Aktueller Stand</span>
              <h2>Version {Number(doc.current_version_number ?? 1)}</h2>
            </div>
            <span className="count-chip">{String(doc.storage_type)}</span>
          </div>

          <div className="document-current-file">
            <div>
              <strong>{doc.original_filename ? String(doc.original_filename) : String(doc.title)}</strong>
              <span>
                {doc.mime_type ? String(doc.mime_type) : String(doc.storage_type)}
                {doc.file_size_bytes ? " · "+formatBytes(doc.file_size_bytes) : ""}
              </span>
              <small>
                Stand {formatDateTime(doc.uploaded_at ?? doc.updated_at)}
                {doc.uploader_name ? " · "+String(doc.uploader_name) : ""}
              </small>
            </div>
            {currentSource}
          </div>

          <div className="document-integrity-row">
            <div><span>Dokumentdatum</span><strong>{formatDate(doc.document_date)}</strong></div>
            <div><span>Prüfen am</span><strong>{formatDate(doc.review_on)}</strong></div>
            <div><span>Gültig bis</span><strong>{formatDate(doc.valid_until)}</strong></div>
            <div><span>Versionen</span><strong>{Number(doc.current_version_number ?? 1)}</strong></div>
          </div>
        </article>

        <article className="panel document-link-card">
          <div className="panel-head">
            <div><span className="eyebrow">Verknüpfungen</span><h2>Zuordnung</h2></div>
          </div>
          <div className="document-link-detail-list">
            <div><span>Mitglied</span><strong>{doc.first_name ? String(doc.first_name)+" "+String(doc.last_name) : "Keine Zuordnung"}</strong></div>
            <div><span>Sitzung</span><strong>{doc.meeting_title ? String(doc.meeting_title) : "Keine Zuordnung"}</strong></div>
            <div><span>Beschluss</span><strong>{doc.resolution_title ? (doc.resolution_number ? String(doc.resolution_number)+" · " : "")+String(doc.resolution_title) : "Keine Zuordnung"}</strong></div>
            <div><span>Sponsor</span><strong>{doc.sponsor_name ? String(doc.sponsor_name) : "Keine Zuordnung"}</strong></div>
            <div><span>Finanzbuchung</span><strong>{doc.finance_description ? String(doc.finance_description) : "Keine Zuordnung"}</strong></div>
          </div>
        </article>
      </section>

      {canWrite && (
        <section className="management-grid">
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Pflege</span><h2>Dokumentdaten bearbeiten</h2></div>
            </div>

            <form action={updateDocumentMetadataAction} className="form-stack">
              <input type="hidden" name="id" value={id} />

              <label>Titel<input name="title" defaultValue={String(doc.title)} required /></label>

              <div className="form-grid">
                <label>Kategorie
                  <select name="category" defaultValue={String(doc.category)}>
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
                <label>Status
                  <select name="status" defaultValue={String(doc.status)}>
                    <option value="active">Aktiv</option>
                    <option value="review">Zu prüfen</option>
                    <option value="expired">Abgelaufen</option>
                    <option value="archived">Archiviert</option>
                  </select>
                </label>
              </div>

              <div className="form-grid">
                <label>Dokumentdatum<input name="documentDate" type="date" defaultValue={dateInput(doc.document_date)} /></label>
                <label>Prüfen am<input name="reviewOn" type="date" defaultValue={dateInput(doc.review_on)} /></label>
              </div>
              <label>Gültig bis<input name="validUntil" type="date" defaultValue={dateInput(doc.valid_until)} /></label>

              <label>Mitglied
                <select name="memberId" defaultValue={doc.member_id ? String(doc.member_id) : ""}>
                  <option value="">Keine Zuordnung</option>
                  {members.map((member)=>(
                    <option key={String(member.id)} value={String(member.id)}>
                      {String(member.first_name)} {String(member.last_name)}
                      {member.status!=="active" ? " · "+String(member.status) : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label>Sitzung
                <select name="meetingId" defaultValue={doc.meeting_id ? String(doc.meeting_id) : ""}>
                  <option value="">Keine Zuordnung</option>
                  {meetings.map((meeting)=>(
                    <option key={String(meeting.id)} value={String(meeting.id)}>
                      {String(meeting.title)} · {formatDate(meeting.starts_at)}
                    </option>
                  ))}
                </select>
              </label>

              <label>Beschluss
                <select name="resolutionId" defaultValue={doc.resolution_id ? String(doc.resolution_id) : ""}>
                  <option value="">Keine Zuordnung</option>
                  {resolutions.map((resolution)=>(
                    <option key={String(resolution.id)} value={String(resolution.id)}>
                      {resolution.resolution_number ? String(resolution.resolution_number)+" · " : ""}
                      {String(resolution.title)}
                    </option>
                  ))}
                </select>
              </label>

              <label>Sponsor
                <select name="sponsorId" defaultValue={doc.sponsor_id ? String(doc.sponsor_id) : ""}>
                  <option value="">Keine Zuordnung</option>
                  {sponsors.map((sponsor)=>(
                    <option key={String(sponsor.id)} value={String(sponsor.id)}>{String(sponsor.name)}</option>
                  ))}
                </select>
              </label>

              <label>Finanzbuchung
                <select name="financeEntryId" defaultValue={doc.finance_entry_id ? String(doc.finance_entry_id) : ""}>
                  <option value="">Keine Zuordnung</option>
                  {financeEntries.map((entry)=>(
                    <option key={String(entry.id)} value={String(entry.id)}>
                      {formatDate(entry.booked_on)} · {String(entry.description)}
                    </option>
                  ))}
                </select>
              </label>

              <label>Notiz<textarea name="notes" rows={4} defaultValue={doc.notes ? String(doc.notes) : ""} /></label>
              <button className="primary-button">Dokumentdaten speichern</button>
            </form>
          </article>

          <article className="panel sticky-panel">
            <div className="panel-head">
              <div><span className="eyebrow">Versionierung</span><h2>Neue Version hinterlegen</h2></div>
            </div>

            {!canReplace ? (
              <div className="document-version-locked">
                {doc.storage_type==="internal"
                  ? "Dieses Dokument wird intern aus der Sitzung erzeugt und kann nicht durch eine Datei ersetzt werden."
                  : "Archivierte Dokumente müssen zuerst wieder aktiviert werden, bevor eine neue Version hinterlegt werden kann."}
              </div>
            ) : (
              <form action={replaceDocumentVersionAction} className="form-stack" encType="multipart/form-data">
                <input type="hidden" name="id" value={id} />

                <div className="document-upload-box">
                  <span className="eyebrow">Neue Datei</span>
                  <label>Datei
                    <input
                      name="file"
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.jpg,.jpeg,.png,.webp"
                    />
                  </label>
                  <small>Max. 4 MB. Die aktuelle Version bleibt in der Historie erhalten.</small>
                </div>

                <div className="document-source-divider"><span>ODER</span></div>
                <label>Neuer externer Link<input name="storageRef" type="url" placeholder="https://…" /></label>
                <label>Änderungsnotiz<textarea name="changeNote" rows={3} placeholder="z. B. Vorstandsbeschluss eingearbeitet, Laufzeit verlängert …" /></label>
                <button className="primary-button">Als neue Version speichern</button>
              </form>
            )}

            <div className="document-danger-section">
              <span className="eyebrow">Löschen</span>
              <p>Das Dokument wird zunächst nur in den Papierkorb verschoben. Die Versionsdateien bleiben dabei erhalten.</p>
              <form action={moveToTrashAction}>
                <input type="hidden" name="type" value="document" />
                <input type="hidden" name="id" value={id} />
                <ConfirmSubmitButton message={"Dokument „"+String(doc.title)+"“ in den Papierkorb verschieben?"}>
                  Dokument löschen
                </ConfirmSubmitButton>
              </form>
            </div>
          </article>
        </section>
      )}

      <article className="panel document-version-history">
        <div className="panel-head">
          <div><span className="eyebrow">Historie</span><h2>Versionen</h2></div>
          <span className="count-chip">{Number(doc.current_version_number ?? 1)}</span>
        </div>

        <div className="document-version-list">
          <div className="document-version-row is-current">
            <div className="document-version-number">v{Number(doc.current_version_number ?? 1)}</div>
            <div className="document-version-main">
              <strong>Aktuelle Version</strong>
              <span>{doc.original_filename ? String(doc.original_filename) : String(doc.storage_type)}</span>
              <small>{formatDateTime(doc.uploaded_at ?? doc.updated_at)}{doc.uploader_name ? " · "+String(doc.uploader_name) : ""}</small>
            </div>
            <div className="document-version-meta">
              <span>{doc.file_size_bytes ? formatBytes(doc.file_size_bytes) : String(doc.storage_type)}</span>
              {doc.checksum_sha256 && <small title={String(doc.checksum_sha256)}>SHA-256 vorhanden</small>}
            </div>
          </div>

          {versions.map((version)=>(
            <div className="document-version-row" key={String(version.id)}>
              <div className="document-version-number">v{Number(version.version_number)}</div>
              <div className="document-version-main">
                <strong>{version.original_filename ? String(version.original_filename) : String(version.storage_type)}</strong>
                <span>
                  Erstellt {formatDateTime(version.created_at)}
                  {version.creator_name ? " · "+String(version.creator_name) : ""}
                </span>
                <small>Ersetzt {formatDateTime(version.replaced_at)}</small>
                {version.change_note && <p>{String(version.change_note)}</p>}
              </div>
              <div className="document-version-meta">
                <span>{version.file_size_bytes ? formatBytes(version.file_size_bytes) : String(version.storage_type)}</span>
                <div>
                  {version.storage_type==="upload" && version.storage_ref && (
                    <>
                      <Link href={"/api/documents/"+id+"/versions/"+String(version.id)+"/file"} target="_blank" className="mini-button">Öffnen</Link>
                      <Link href={"/api/documents/"+id+"/versions/"+String(version.id)+"/file?download=1"} className="mini-button">Download</Link>
                    </>
                  )}
                  {version.storage_type==="link" && version.storage_ref && (
                    <a href={String(version.storage_ref)} target="_blank" rel="noreferrer" className="mini-button">Link öffnen</a>
                  )}
                  {version.storage_type==="internal" && version.storage_ref && (
                    <Link href={String(version.storage_ref)} className="mini-button">Intern öffnen</Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
