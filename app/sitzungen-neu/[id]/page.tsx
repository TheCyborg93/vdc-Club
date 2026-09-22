import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  getMeetingV3Readiness,
  meetingV3AgendaTypeLabels,
  meetingV3ModeLabels,
  meetingV3StateLabels,
  meetingV3TypeLabels,
  type MeetingV3AgendaType,
  type MeetingV3Mode,
  type MeetingV3State,
  type MeetingV3Type,
} from "@/lib/meeting-v3";
import {
  addMeetingV3AgendaAction,
  markMeetingV3ReadyAction,
  reopenMeetingV3PreparationAction,
  updateMeetingV3BasicsAction,
  updateMeetingV3InvitationAction,
  updateMeetingV3OfficersAction,
} from "@/app/sitzungen-neu/actions";

export const dynamic="force-dynamic";

const errors:Record<string,string>={
  database:"Die Datenbankverbindung fehlt.",
  missing:"Bitte alle Pflichtfelder ausfüllen.",
  invitation:"Die Einladung ist noch nicht vollständig dokumentiert.",
  officers:"Sitzungsleitung und Protokollführung müssen Teilnehmer der Sitzung sein.",
  agenda:"Der TOP konnte nicht angelegt werden.",
  locked:"Dieser Bereich ist in der aktuellen Phase gesperrt.",
  not_ready:"Die Sitzung erfüllt noch nicht alle Voraussetzungen für „Bereit“.",
};

function formatDateTime(value:unknown){
  if(!value) return "–";
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    weekday:"short",day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",timeZone:"Europe/Berlin",
  }).format(date);
}

function toLocalInput(value:unknown){
  if(!value) return "";
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime())) return "";
  const parts=new Intl.DateTimeFormat("de-DE",{
    timeZone:"Europe/Berlin",
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hour12:false,
  }).formatToParts(date);
  const map=Object.fromEntries(parts.map((part)=>[part.type,part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export default async function MeetingV3DetailPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{error?:string;created?:string;saved?:string;invitation?:string;officers?:string;agenda?:string;ready?:string;preparation?:string}>;
}){
  const actor=await requirePermission("meetings.read");
  const {id}=await params;
  const query=await searchParams;
  const sql=getDb();
  if(!sql) notFound();

  const [rows,participants,agenda]=await Promise.all([
    sql`
      SELECT
        m.*,
        chair.first_name AS chair_first_name,chair.last_name AS chair_last_name,
        minute.first_name AS minute_first_name,minute.last_name AS minute_last_name,
        (SELECT count(*)::int FROM meeting_v3_participants p WHERE p.meeting_id=m.id) AS participant_count,
        (SELECT count(*)::int FROM meeting_v3_agenda_items ai WHERE ai.meeting_id=m.id) AS agenda_count
      FROM meeting_v3_meetings m
      LEFT JOIN members chair ON chair.id=m.chair_member_id
      LEFT JOIN members minute ON minute.id=m.minute_taker_member_id
      WHERE m.id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT
        p.id::text,p.member_id::text,p.attendance,p.voting_eligible,p.role_in_meeting,
        m.first_name,m.last_name
      FROM meeting_v3_participants p
      JOIN members m ON m.id=p.member_id
      WHERE p.meeting_id=${id}::uuid
      ORDER BY
        CASE p.role_in_meeting WHEN 'chair' THEN 0 WHEN 'minute_taker' THEN 1 ELSE 2 END,
        m.last_name,m.first_name
    `,
    sql`
      SELECT
        ai.id::text,ai.position,ai.title,ai.agenda_type,ai.description,
        ai.estimated_minutes,ai.status,ai.spontaneous,ai.announced_with_invitation,
        m.first_name AS responsible_first_name,m.last_name AS responsible_last_name
      FROM meeting_v3_agenda_items ai
      LEFT JOIN members m ON m.id=ai.responsible_member_id
      WHERE ai.meeting_id=${id}::uuid
      ORDER BY ai.position
    `,
  ]);

  const meeting=rows[0];
  if(!meeting) notFound();

  const state=String(meeting.lifecycle_state) as MeetingV3State;
  const canWrite=hasPermission(actor.roles,"meetings.write");
  const editable=state==="preparation";

  const readiness=getMeetingV3Readiness({
    chairMemberId:meeting.chair_member_id ? String(meeting.chair_member_id) : null,
    minuteTakerMemberId:meeting.minute_taker_member_id ? String(meeting.minute_taker_member_id) : null,
    invitedAt:meeting.invited_at,
    invitationMethod:meeting.invitation_method ? String(meeting.invitation_method) : null,
    invitationTimely:meeting.invitation_timely as boolean | null,
    agendaSentWithInvitation:meeting.agenda_sent_with_invitation as boolean | null,
    participantCount:Number(meeting.participant_count ?? 0),
    agendaCount:Number(meeting.agenda_count ?? 0),
  });

  const meetingType=String(meeting.meeting_type) as MeetingV3Type;
  const meetingMode=String(meeting.meeting_mode) as MeetingV3Mode;

  return (
    <div className="page-stack meeting-v3-page">
      <Link href="/sitzungen-neu" className="back-link">← Zur V3-Sitzungszentrale</Link>

      <section className="meeting-v3-hero">
        <div>
          <span className="eyebrow">Sitzungssystem V3 · {meetingV3StateLabels[state]}</span>
          <h1>{String(meeting.title)}</h1>
          <p>
            {meetingType==="custom"
              ? String(meeting.custom_type_label || "Freie Sitzung")
              : meetingV3TypeLabels[meetingType]}
            {" · "}{formatDateTime(meeting.starts_at)}
            {" · "}{meeting.location ? String(meeting.location) : "Ort offen"}
          </p>
        </div>
        <div className="meeting-v3-hero-state">
          <span className={`meeting-v3-state ${state}`}>{meetingV3StateLabels[state]}</span>
          <span className="meeting-v3-preview-chip">V3</span>
        </div>
      </section>

      {query.error && <p className="form-error">{errors[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</p>}
      {(query.created || query.saved || query.invitation || query.officers || query.agenda || query.ready || query.preparation) && (
        <p className="form-success">
          {query.created ? "Sitzung wurde angelegt und automatisch vorbereitet." :
           query.ready ? "Die Sitzung ist jetzt bereit für den Startcheck." :
           query.preparation ? "Die Sitzung ist wieder in Vorbereitung." :
           "Änderungen wurden gespeichert."}
        </p>
      )}

      <section className="meeting-v3-readiness">
        <div className="meeting-v3-readiness-head">
          <div>
            <span className="eyebrow">Vorbereitungsstatus</span>
            <h2>{readiness.completed}/{readiness.total} Punkte erledigt</h2>
            <p>{readiness.ready ? "Alle Voraussetzungen sind erfüllt." : `${readiness.criticalOpen} Punkt(e) fehlen noch.`}</p>
          </div>
          <strong>{readiness.percent}%</strong>
        </div>
        <div className="meeting-v3-progress"><span style={{width:`${readiness.percent}%`}}/></div>
        <div className="meeting-v3-check-grid">
          {readiness.checks.map((check)=>(
            <div className={check.complete ? "meeting-v3-check complete" : "meeting-v3-check"} key={check.key}>
              <b>{check.complete ? "✓" : "!"}</b>
              <span>{check.label}</span>
            </div>
          ))}
        </div>

        {canWrite && state==="preparation" && (
          <form action={markMeetingV3ReadyAction}>
            <input type="hidden" name="meetingId" value={id}/>
            <button className="primary-button" type="submit" disabled={!readiness.ready}>
              Vorbereitung abschließen
            </button>
          </form>
        )}

        {canWrite && state==="ready" && (
          <form action={reopenMeetingV3PreparationAction}>
            <input type="hidden" name="meetingId" value={id}/>
            <button className="ghost-button" type="submit">Vorbereitung wieder öffnen</button>
          </form>
        )}
      </section>

      <section className="meeting-v3-work-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">1 · Rahmen</span><h2>Eckdaten</h2></div>
            <span className="count-chip">{meetingV3ModeLabels[meetingMode]}</span>
          </div>
          {editable && canWrite ? (
            <form action={updateMeetingV3BasicsAction} className="form-grid">
              <input type="hidden" name="meetingId" value={id}/>
              <label>Titel<input name="title" required defaultValue={String(meeting.title)}/></label>
              <label>Start<input name="startsAt" type="datetime-local" required defaultValue={toLocalInput(meeting.starts_at)}/></label>
              <label>Format
                <select name="meetingMode" defaultValue={meetingMode}>
                  <option value="in_person">Präsenz</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="online">Online</option>
                </select>
              </label>
              <label>Ort<input name="location" defaultValue={String(meeting.location ?? "")}/></label>
              <label className="meeting-v3-wide">Beschreibung<textarea name="description" rows={3} defaultValue={String(meeting.description ?? "")}/></label>
              <div className="meeting-v3-wide meeting-v3-form-submit"><button className="ghost-button" type="submit">Eckdaten speichern</button></div>
            </form>
          ) : (
            <div className="meeting-v3-readonly">
              <span>{formatDateTime(meeting.starts_at)}</span>
              <span>{meeting.location ? String(meeting.location) : "Ort offen"}</span>
              <span>{meetingV3ModeLabels[meetingMode]}</span>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">2 · Verantwortung</span><h2>Leitung & Protokoll</h2></div>
          </div>
          {editable && canWrite ? (
            <form action={updateMeetingV3OfficersAction} className="form-stack">
              <input type="hidden" name="meetingId" value={id}/>
              <label>Sitzungsleitung
                <select name="chairMemberId" defaultValue={String(meeting.chair_member_id ?? "")} required>
                  <option value="">Bitte auswählen</option>
                  {participants.map((person)=><option value={String(person.member_id)} key={String(person.id)}>{String(person.first_name)} {String(person.last_name)}</option>)}
                </select>
              </label>
              <label>Protokollführung
                <select name="minuteTakerMemberId" defaultValue={String(meeting.minute_taker_member_id ?? "")} required>
                  <option value="">Bitte auswählen</option>
                  {participants.map((person)=><option value={String(person.member_id)} key={String(person.id)}>{String(person.first_name)} {String(person.last_name)}</option>)}
                </select>
              </label>
              <button className="ghost-button" type="submit">Rollen speichern</button>
            </form>
          ) : (
            <div className="meeting-v3-readonly">
              <span>Leitung: {meeting.chair_first_name ? `${meeting.chair_first_name} ${meeting.chair_last_name}` : "offen"}</span>
              <span>Protokoll: {meeting.minute_first_name ? `${meeting.minute_first_name} ${meeting.minute_last_name}` : "offen"}</span>
            </div>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">3 · Einladung</span><h2>Einladung dokumentieren</h2></div>
          <span className="count-chip">{meeting.invited_at ? "erfasst" : "offen"}</span>
        </div>

        {editable && canWrite ? (
          <form action={updateMeetingV3InvitationAction} className="form-grid">
            <input type="hidden" name="meetingId" value={id}/>
            <label>Einladung versendet am
              <input name="invitedAt" type="datetime-local" required defaultValue={toLocalInput(meeting.invited_at)}/>
            </label>
            <label>Einladungsweg
              <input name="invitationMethod" required defaultValue={String(meeting.invitation_method ?? "")} placeholder="z. B. E-Mail, WhatsApp"/>
            </label>
            <label>Fristgerecht?
              <select name="invitationTimely" required defaultValue={meeting.invitation_timely==null ? "" : meeting.invitation_timely ? "yes" : "no"}>
                <option value="">Bitte auswählen</option><option value="yes">Ja</option><option value="no">Nein</option>
              </select>
            </label>
            <label>Tagesordnung mitgesendet?
              <select name="agendaSentWithInvitation" required defaultValue={meeting.agenda_sent_with_invitation==null ? "" : meeting.agenda_sent_with_invitation ? "yes" : "no"}>
                <option value="">Bitte auswählen</option><option value="yes">Ja</option><option value="no">Nein</option>
              </select>
            </label>
            <div className="meeting-v3-wide meeting-v3-form-submit"><button className="ghost-button" type="submit">Einladung speichern</button></div>
          </form>
        ) : (
          <div className="meeting-v3-readonly">
            <span>{meeting.invited_at ? formatDateTime(meeting.invited_at) : "Noch nicht dokumentiert"}</span>
            <span>{meeting.invitation_method ? String(meeting.invitation_method) : "Einladungsweg offen"}</span>
          </div>
        )}
      </section>

      <section className="meeting-v3-work-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">4 · Teilnehmer</span><h2>Teilnehmerkreis</h2></div>
            <span className="count-chip">{participants.length}</span>
          </div>
          <div className="meeting-v3-person-list">
            {participants.map((person)=>(
              <div className="meeting-v3-person" key={String(person.id)}>
                <div><strong>{String(person.first_name)} {String(person.last_name)}</strong><span>{String(person.role_in_meeting)==="chair" ? "Sitzungsleitung" : String(person.role_in_meeting)==="minute_taker" ? "Protokollführung" : "Teilnehmer"}</span></div>
                <span>{String(person.attendance)==="invited" ? "Eingeladen" : String(person.attendance)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">5 · Tagesordnung</span><h2>TOPs planen</h2></div>
            <span className="count-chip">{agenda.length}</span>
          </div>
          <div className="meeting-v3-agenda-list">
            {agenda.map((item)=>(
              <div className="meeting-v3-agenda-item" key={String(item.id)}>
                <b>{Number(item.position)}</b>
                <div>
                  <strong>{String(item.title)}</strong>
                  <span>{meetingV3AgendaTypeLabels[String(item.agenda_type) as MeetingV3AgendaType]}</span>
                  {item.description && <small>{String(item.description)}</small>}
                </div>
              </div>
            ))}
          </div>

          {editable && canWrite && (
            <details className="meeting-v3-add-top">
              <summary>TOP hinzufügen</summary>
              <form action={addMeetingV3AgendaAction} className="form-stack">
                <input type="hidden" name="meetingId" value={id}/>
                <label>Titel<input name="title" required placeholder="Neuer Tagesordnungspunkt"/></label>
                <label>Typ
                  <select name="agendaType" defaultValue="consultation">
                    <option value="information">Information</option>
                    <option value="consultation">Beratung</option>
                    <option value="decision">Beschluss</option>
                  </select>
                </label>
                <label>Beschreibung<textarea name="description" rows={3} placeholder="Optional"/></label>
                <button className="ghost-button" type="submit">TOP hinzufügen</button>
              </form>
            </details>
          )}
        </article>
      </section>
    </div>
  );
}
