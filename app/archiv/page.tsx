import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { restoreDocumentAction } from "@/app/dokumente/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { meetingStatusLabel,resolutionStatusLabel,sponsorStatusLabel } from "@/lib/ui-labels";

export const dynamic="force-dynamic";

function formatDate(value: unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(date);
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ restored?:string;error?:string }>;
}) {
  const actor=await requirePermission("documents.read");
  const sql=getDb();
  const params=await searchParams;

  const canMembers=hasPermission(actor.roles,"members.read");
  const canMeetings=hasPermission(actor.roles,"meetings.read");
  const canResolutions=hasPermission(actor.roles,"resolutions.read");
  const canSponsors=hasPermission(actor.roles,"sponsors.read");
  const canWriteDocuments=hasPermission(actor.roles,"documents.write");

  const [documents,members,meetings,resolutions,sponsors]=sql
    ? await Promise.all([
        sql`
          SELECT id::text,title,category,document_date,archived_at,storage_type,storage_ref,original_filename,file_size_bytes,meeting_id::text
          FROM documents
          WHERE status='archived'
            AND deleted_at IS NULL
          ORDER BY archived_at DESC NULLS LAST,created_at DESC
          LIMIT 100
        `,
        canMembers ? sql`
          SELECT id::text,first_name,last_name,leave_date,status_reason
          FROM members
          WHERE status='inactive'
          ORDER BY leave_date DESC NULLS LAST,last_name,first_name
          LIMIT 100
        ` : Promise.resolve([]),
        canMeetings ? sql`
          SELECT id::text,title,starts_at,ended_at,status,minutes_status
          FROM meetings
          WHERE status IN ('completed','cancelled')
            AND deleted_at IS NULL
          ORDER BY starts_at DESC
          LIMIT 80
        ` : Promise.resolve([]),
        canResolutions ? sql`
          SELECT id::text,resolution_number,title,status,decided_at,implemented_at
          FROM resolutions
          WHERE status IN ('implemented','withdrawn')
          ORDER BY decided_at DESC
          LIMIT 100
        ` : Promise.resolve([]),
        canSponsors ? sql`
          SELECT id::text,name,status,contract_end
          FROM sponsors
          WHERE deleted_at IS NULL
            AND status IN ('expired','inactive')
          ORDER BY contract_end DESC NULLS LAST,name
          LIMIT 80
        ` : Promise.resolve([]),
      ])
    : [[],[],[],[],[]];

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Vorstandsarbeit</span>
          <h1>Archiv</h1>
          <p>Abgeschlossene und archivierte Vereinsvorgänge – weiterhin auffindbar, aber aus den aktiven Ansichten entfernt.</p>
        </div>
      </section>

      {params.restored && <div className="form-success">Dokument wurde aus dem Archiv wiederhergestellt.</div>}
      {params.error==="protocol_locked" && (
        <div className="form-error">
          Freigegebene Sitzungsprotokolle sind finale Vereinsunterlagen und können hier weder reaktiviert noch gelöscht werden.
        </div>
      )}

      <section className="stat-grid">
        <article className="stat-card"><span>Dokumente</span><strong>{documents.length}</strong><small>archiviert</small></article>
        {canMembers && <article className="stat-card"><span>Mitglieder</span><strong>{members.length}</strong><small>inaktiv</small></article>}
        {canMeetings && <article className="stat-card"><span>Sitzungen</span><strong>{meetings.length}</strong><small>abgeschlossen</small></article>}
        {canResolutions && <article className="stat-card"><span>Beschlüsse</span><strong>{resolutions.length}</strong><small>abgeschlossen</small></article>}
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Dokumente</span><h2>Dokumentenarchiv</h2></div>
          <span className="count-chip">{documents.length}</span>
        </div>
        <div className="archive-list">
          {documents.length===0 ? (
            <div className="empty-state">Noch keine Dokumente archiviert.</div>
          ) : documents.map((doc)=>{
            const isMeetingMinutes=String(doc.category)==="Protokoll" && Boolean(doc.meeting_id);
            const primaryHref=isMeetingMinutes
              ? "/sitzungen/"+String(doc.meeting_id)+"/protokoll"
              : "/dokumente/"+String(doc.id);

            return (
              <div className={"archive-row "+(isMeetingMinutes ? "archive-final-minutes" : "")} key={String(doc.id)}>
                <div>
                  <Link href={primaryHref} className="document-title-link">
                    <strong>{String(doc.title)}</strong>
                  </Link>
                  <span>
                    {isMeetingMinutes ? "Finales Sitzungsprotokoll" : String(doc.category)}
                    {" · "}
                    {doc.document_date ? formatDate(doc.document_date) : "ohne Dokumentdatum"}
                  </span>
                  <small>
                    Archiviert {formatDate(doc.archived_at)}
                    {doc.storage_type==="upload" && doc.original_filename ? " · Datei: "+String(doc.original_filename) : ""}
                  </small>
                </div>
                <div className="archive-row-actions">
                  {isMeetingMinutes ? (
                    <>
                      <Link href={primaryHref} className="primary-button">Protokoll öffnen</Link>
                      <Link href={"/dokumente/"+String(doc.id)} className="mini-button">Dokumentdetails</Link>
                    </>
                  ) : (
                    <>
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
                      {canWriteDocuments && (
                        <>
                          <form action={restoreDocumentAction}>
                            <input type="hidden" name="id" value={String(doc.id)} />
                            <button className="mini-button">Wiederherstellen</button>
                          </form>
                          <form action={moveToTrashAction}>
                            <input type="hidden" name="type" value="document" />
                            <input type="hidden" name="id" value={String(doc.id)} />
                            <ConfirmSubmitButton message={"Archiviertes Dokument „"+String(doc.title)+"“ in den Papierkorb verschieben?"}>
                              Löschen
                            </ConfirmSubmitButton>
                          </form>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </article>

      {canMeetings && (
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Sitzungen</span><h2>Abgeschlossene Sitzungen</h2></div>
            <span className="count-chip">{meetings.length}</span>
          </div>
          <div className="archive-grid">
            {meetings.map((meeting)=>{
              const hasFinalMinutes=meeting.minutes_status==="archived";
              return (
                <Link
                  href={hasFinalMinutes
                    ? "/sitzungen/"+String(meeting.id)+"/protokoll"
                    : "/sitzungen/"+String(meeting.id)}
                  key={String(meeting.id)}
                >
                  <strong>{String(meeting.title)}</strong>
                  <span>
                    {formatDate(meeting.starts_at)} · {meetingStatusLabel(meeting.status)}
                    {hasFinalMinutes ? " · Protokoll archiviert" : ""}
                  </span>
                </Link>
              );
            })}
          </div>
        </article>
      )}

      {canResolutions && (
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Beschlüsse</span><h2>Abgeschlossene Beschlüsse</h2></div>
            <span className="count-chip">{resolutions.length}</span>
          </div>
          <div className="archive-grid">
            {resolutions.map((resolution)=>(
              <Link href="/beschluesse" key={String(resolution.id)}>
                <strong>
                  {resolution.resolution_number ? String(resolution.resolution_number)+" · " : ""}
                  {String(resolution.title)}
                </strong>
                <span>{resolutionStatusLabel(resolution.status)} · {formatDate(resolution.implemented_at ?? resolution.decided_at)}</span>
              </Link>
            ))}
          </div>
        </article>
      )}

      {(canMembers || canSponsors) && (
        <section className="panel-grid">
          {canMembers && (
            <article className="panel">
              <div className="panel-head"><div><span className="eyebrow">Mitglieder</span><h2>Ehemalige Mitglieder</h2></div></div>
              <div className="archive-mini-list">
                {members.length===0 ? <div className="empty-state">Keine inaktiven Mitglieder.</div> : members.map((member)=>(
                  <Link href={"/mitglieder/"+String(member.id)} key={String(member.id)}>
                    <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                    <span>Austritt {formatDate(member.leave_date)}{member.status_reason ? " · "+String(member.status_reason) : ""}</span>
                  </Link>
                ))}
              </div>
            </article>
          )}

          {canSponsors && (
            <article className="panel">
              <div className="panel-head"><div><span className="eyebrow">Partner</span><h2>Ehemalige Sponsoren</h2></div></div>
              <div className="archive-mini-list">
                {sponsors.length===0 ? <div className="empty-state">Keine ehemaligen Sponsoren.</div> : sponsors.map((sponsor)=>(
                  <Link href="/sponsoren" key={String(sponsor.id)}>
                    <strong>{String(sponsor.name)}</strong>
                    <span>{sponsorStatusLabel(sponsor.status)} · Vertragsende {formatDate(sponsor.contract_end)}</span>
                  </Link>
                ))}
              </div>
            </article>
          )}
        </section>
      )}
    </div>
  );
}
