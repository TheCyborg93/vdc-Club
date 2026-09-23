import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import { meetingV3CanApproveMinutes } from "@/lib/meeting-v3";
import {
  archiveMeetingV3MinutesAction,
  returnMeetingV3MinutesDraftAction,
  submitMeetingV3MinutesReviewAction,
} from "@/app/sitzungen-neu/closing-actions";

export const dynamic="force-dynamic";

type JsonObject=Record<string,unknown>;

function asObject(value:unknown):JsonObject{
  return value && typeof value==="object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function asArray(value:unknown):JsonObject[]{
  return Array.isArray(value) ? value.map(asObject) : [];
}

function textValue(value:unknown,fallback="–"){
  const text=String(value ?? "").trim();
  return text || fallback;
}

function formatDateTime(value:unknown){
  if(!value) return "–";
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    weekday:"short",day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",timeZone:"Europe/Berlin",
  }).format(date);
}

const statusLabels:Record<string,string>={
  draft:"Entwurf",
  review:"In Prüfung",
  archived:"Archiviert",
};

const resultLabels:Record<string,string>={
  noted:"Zur Kenntnis genommen",
  completed:"Erledigt",
  deferred:"Vertagt",
  resolution:"Beschluss gefasst",
  no_decision:"Keine Entscheidung",
};

const errors:Record<string,string>={
  locked:"Dieser Protokollstatus kann aktuell nicht geändert werden.",
  reason:"Für die Rückgabe ist ein Änderungsgrund erforderlich.",
};

export default async function MeetingV3MinutesPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{error?:string;created?:string;review?:string;returned?:string;archived?:string}>;
}){
  const actor=await requirePermission("meetings.read");
  const {id}=await params;
  const query=await searchParams;
  const sql=getDb();
  if(!sql) notFound();

  const rows=await sql`
    SELECT
      m.id::text,m.title,m.lifecycle_state,m.minutes_status,m.current_minutes_revision,
      m.next_meeting_at,m.archived_at,
      mr.id::text AS revision_id,mr.revision,mr.status AS revision_status,
      mr.snapshot,mr.change_reason,mr.created_at AS revision_created_at
    FROM meeting_v3_meetings m
    LEFT JOIN meeting_v3_minutes_revisions mr
      ON mr.meeting_id=m.id AND mr.revision=m.current_minutes_revision
    WHERE m.id=${id}::uuid
    LIMIT 1
  `;

  const meeting=rows[0];
  if(!meeting) notFound();

  const state=String(meeting.lifecycle_state);
  if(state==="closing") redirect(`/sitzungen-neu/${id}/close`);
  if(state==="live") redirect(`/sitzungen-neu/${id}/live`);
  if(!["minutes_draft","minutes_review","archived"].includes(state)) redirect(`/sitzungen-neu/${id}`);
  if(!meeting.revision_id) notFound();

  const rawSnapshot=typeof meeting.snapshot==="string"
    ? JSON.parse(String(meeting.snapshot))
    : meeting.snapshot;
  const snapshot=asObject(rawSnapshot);
  const meetingSnapshot=asObject(snapshot.meeting);
  const participants=asArray(snapshot.participants);
  const guests=asArray(snapshot.guests);
  const agenda=asArray(snapshot.agenda);
  const generalAttachments=asArray(snapshot.generalAttachments);

  const canWrite=hasPermission(actor.roles,"meetings.write");
  const canApprove=hasPermission(actor.roles,"meetings.write") && meetingV3CanApproveMinutes(actor.roles);
  const status=String(meeting.minutes_status ?? meeting.revision_status ?? "draft");

  const presentParticipants=participants.filter((person)=>["present","late","left_early"].includes(String(person.attendance)));
  const absentParticipants=participants.filter((person)=>["absent","excused"].includes(String(person.attendance)));
  const resolutionCount=agenda.reduce((sum,item)=>sum+asArray(item.resolutions).length,0);

  return (
    <div className="page-stack meeting-v3-page meeting-v3-minutes-page">
      <section className="meeting-v3-minutes-workflow">
        <div className="done"><span>1</span><strong>Sitzung</strong><small>abgeschlossen</small></div>
        <div className={status==="draft" ? "current" : "done"}><span>2</span><strong>Entwurf</strong><small>Version {Number(meeting.revision)}</small></div>
        <div className={status==="review" ? "current" : status==="archived" ? "done" : ""}><span>3</span><strong>Prüfung</strong><small>{status==="review" ? "wartet auf Freigabe" : "Vorstand"}</small></div>
        <div className={status==="archived" ? "current done" : ""}><span>4</span><strong>Archiv</strong><small>{status==="archived" ? "final" : "gesperrt"}</small></div>
      </section>

      {query.error && <p className="form-error">{errors[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</p>}
      {(query.created || query.review || query.returned || query.archived) && (
        <p className="form-success">
          {query.created ? "Der Protokollentwurf wurde automatisch aus der Sitzungsakte erzeugt." :
           query.review ? "Das Protokoll wurde zur Prüfung eingereicht." :
           query.returned ? "Das Protokoll wurde zur Nachbearbeitung zurückgegeben." :
           "Das Protokoll wurde final archiviert."}
        </p>
      )}

      <section className="meeting-v3-minutes-toolbar">
        <div>
          <span className="eyebrow">Protokoll V3 · Revision {Number(meeting.revision)}</span>
          <h1>{String(meeting.title)}</h1>
          <p>{statusLabels[status] ?? status} · Snapshot vom {formatDateTime(meeting.revision_created_at)}</p>
        </div>
        <div>
          <span className={`meeting-v3-state ${status==="archived" ? "archived" : status==="review" ? "minutes_review" : "minutes_draft"}`}>
            {statusLabels[status] ?? status}
          </span>
          <Link href={`/sitzungen-neu/${id}`} className="ghost-button">Sitzungsakte</Link>
        </div>
      </section>

      <section className="meeting-v3-minutes-quality">
        <article><span>Anwesend</span><strong>{presentParticipants.length}</strong><small>{absentParticipants.length} abwesend / entschuldigt</small></article>
        <article><span>TOPs</span><strong>{agenda.length}</strong><small>{agenda.filter((item)=>String(item.status)==="deferred").length} vertagt</small></article>
        <article><span>Beschlüsse</span><strong>{resolutionCount}</strong><small>aus allen TOPs</small></article>
        <article><span>Anlagen</span><strong>{generalAttachments.length + agenda.reduce((sum,item)=>sum+asArray(item.attachments).length,0)}</strong><small>verknüpft</small></article>
      </section>

      <article className="meeting-v3-minutes-document">
        <header className="meeting-v3-minutes-document-head">
          <div>
            <span className="eyebrow">Vestischer Dart Club e.V.</span>
            <h2>Protokoll · {textValue(meetingSnapshot.title,String(meeting.title))}</h2>
          </div>
          {status!=="archived" && <span className="meeting-v3-minutes-watermark">{status==="review" ? "PRÜFUNG" : "ENTWURF"}</span>}
        </header>

        <section className="meeting-v3-minutes-formal">
          <div><span>Geplant</span><strong>{formatDateTime(meetingSnapshot.startsAt)}</strong></div>
          <div><span>Tatsächlicher Beginn</span><strong>{formatDateTime(meetingSnapshot.openedAt)}</strong></div>
          <div><span>Tatsächliches Ende</span><strong>{formatDateTime(meetingSnapshot.endedAt)}</strong></div>
          <div><span>Ort</span><strong>{textValue(meetingSnapshot.location)}</strong></div>
          <div><span>Sitzungsart</span><strong>{textValue(meetingSnapshot.meetingMode)}</strong></div>
          <div><span>Einladung</span><strong>{formatDateTime(meetingSnapshot.invitedAt)}</strong></div>
          <div><span>Einladungsweg</span><strong>{textValue(meetingSnapshot.invitationMethod)}</strong></div>
          <div><span>Beschlussfähig</span><strong>{meetingSnapshot.quorumConfirmed===true ? "Ja" : meetingSnapshot.quorumConfirmed===false ? "Nein" : "Nicht dokumentiert"}</strong></div>
        </section>

        {(meetingSnapshot.quorumBasis || meetingSnapshot.quorumNote) && (
          <section className="meeting-v3-minutes-note">
            <strong>Beschlussfähigkeit</strong>
            {meetingSnapshot.quorumBasis && <p>Grundlage: {textValue(meetingSnapshot.quorumBasis)}</p>}
            {meetingSnapshot.quorumNote && <p>{textValue(meetingSnapshot.quorumNote)}</p>}
          </section>
        )}

        <section className="meeting-v3-minutes-section">
          <div className="meeting-v3-minutes-section-head"><span className="eyebrow">Teilnahme</span><h3>Vorstand & Gäste</h3></div>
          <div className="meeting-v3-minutes-attendees">
            {participants.map((person)=>(
              <div key={textValue(person.memberId)+textValue(person.name)}>
                <strong>{textValue(person.name)}</strong>
                <span>{textValue(person.attendance)} · {person.votingEligible===true ? "stimmberechtigt" : "nicht stimmberechtigt"}</span>
              </div>
            ))}
            {guests.map((guest)=>(
              <div key={textValue(guest.id)+textValue(guest.name)}>
                <strong>{textValue(guest.name)}</strong>
                <span>Gast{guest.organization ? ` · ${textValue(guest.organization)}` : ""}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="meeting-v3-minutes-section">
          <div className="meeting-v3-minutes-section-head"><span className="eyebrow">Tagesordnung</span><h3>Verlauf & Ergebnisse</h3></div>
          <div className="meeting-v3-minutes-agenda">
            {agenda.map((item)=> {
              const resolutions=asArray(item.resolutions);
              const exclusions=asArray(item.exclusions);
              const attachments=asArray(item.attachments);
              return (
                <article key={textValue(item.id)}>
                  <header>
                    <b>TOP {Number(item.position ?? 0)}</b>
                    <div>
                      <strong>{textValue(item.title)}</strong>
                      <span>{textValue(item.type)} · {resultLabels[String(item.resultCode)] ?? textValue(item.resultCode,"ohne Ergebnis")}</span>
                    </div>
                  </header>

                  {item.description && <p className="meeting-v3-minutes-description">{textValue(item.description)}</p>}
                  {item.note && <div className="meeting-v3-minutes-top-note">{textValue(item.note)}</div>}
                  {item.spontaneous===true && (
                    <div className="meeting-v3-minutes-spontaneous">Spontan ergänzt · {textValue(item.spontaneousReason)}</div>
                  )}

                  {exclusions.length>0 && (
                    <div className="meeting-v3-minutes-exclusions">
                      <strong>Befangenheit / Stimmrechtsausschluss</strong>
                      {exclusions.map((entry)=>(
                        <span key={textValue(entry.id)}>{textValue(entry.name)} · {textValue(entry.reason)}</span>
                      ))}
                    </div>
                  )}

                  {resolutions.map((resolution)=>(
                    <div className="meeting-v3-minutes-resolution" key={textValue(resolution.id)}>
                      <div>
                        <span>{textValue(resolution.number)}</span>
                        <strong>{textValue(resolution.title)}</strong>
                      </div>
                      <p>{textValue(resolution.decisionText)}</p>
                      <div className="meeting-v3-minutes-vote">
                        <span>Ja {Number(resolution.yes ?? 0)}</span>
                        <span>Nein {Number(resolution.no ?? 0)}</span>
                        <span>Enthaltung {Number(resolution.abstain ?? 0)}</span>
                        <b>{String(resolution.outcome)==="accepted" ? "Angenommen" : "Abgelehnt"}</b>
                      </div>
                    </div>
                  ))}

                  {attachments.length>0 && (
                    <div className="meeting-v3-minutes-attachments">
                      <strong>Anlagen</strong>
                      {attachments.map((attachment)=><span key={textValue(attachment.id)}>{textValue(attachment.title)}</span>)}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {generalAttachments.length>0 && (
          <section className="meeting-v3-minutes-section">
            <div className="meeting-v3-minutes-section-head"><span className="eyebrow">Unterlagen</span><h3>Allgemeine Anlagen</h3></div>
            <div className="meeting-v3-minutes-attachments">
              {generalAttachments.map((attachment)=><span key={textValue(attachment.id)}>{textValue(attachment.title)}</span>)}
            </div>
          </section>
        )}

        {meeting.next_meeting_at && (
          <section className="meeting-v3-minutes-note">
            <strong>Nächster Termin</strong>
            <p>{formatDateTime(meeting.next_meeting_at)}</p>
          </section>
        )}
      </article>

      {status==="draft" && canWrite && (
        <section className="meeting-v3-minutes-decision">
          <div><span className="eyebrow">Nächster Schritt</span><h2>Zur Prüfung einreichen</h2><p>Der Snapshot bleibt unverändert und wird für die Vorstandsfreigabe gesperrt.</p></div>
          <form action={submitMeetingV3MinutesReviewAction}>
            <input type="hidden" name="meetingId" value={id}/>
            <button className="primary-button" type="submit">Protokoll zur Prüfung geben</button>
          </form>
        </section>
      )}

      {status==="review" && (
        <section className="meeting-v3-minutes-review-actions">
          <div>
            <span className="eyebrow">Prüfung</span>
            <h2>Freigabeentscheidung</h2>
            <p>{canApprove ? "Du kannst das Protokoll freigeben oder mit Grund zurückgeben." : "Das Protokoll wartet auf eine berechtigte Freigabe."}</p>
          </div>

          {canApprove && (
            <div className="meeting-v3-minutes-review-forms">
              <form action={archiveMeetingV3MinutesAction}>
                <input type="hidden" name="meetingId" value={id}/>
                <button className="primary-button" type="submit">Final freigeben & archivieren</button>
              </form>
              <form action={returnMeetingV3MinutesDraftAction} className="meeting-v3-minutes-return">
                <input type="hidden" name="meetingId" value={id}/>
                <label>Änderungsgrund
                  <textarea name="reason" rows={2} required placeholder="Was muss korrigiert werden?"/>
                </label>
                <button className="ghost-button" type="submit">Zur Nachbearbeitung zurückgeben</button>
              </form>
            </div>
          )}
        </section>
      )}

      {status==="archived" && (
        <section className="meeting-v3-minutes-archived">
          <div><span className="eyebrow">Final</span><h2>Protokoll archiviert</h2><p>Diese Revision ist die finale, schreibgeschützte Fassung.</p></div>
          <span>{formatDateTime(meeting.archived_at)}</span>
        </section>
      )}
    </div>
  );
}
