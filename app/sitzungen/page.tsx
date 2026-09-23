import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  meetingV3ModeLabels,
  meetingV3StateLabels,
  meetingV3TypeLabels,
  type MeetingV3Mode,
  type MeetingV3State,
  type MeetingV3Type,
} from "@/lib/meeting-v3";
import { createMeetingV3Action } from "@/app/sitzungen/actions";

export const dynamic="force-dynamic";

const errors:Record<string,string>={
  database:"Die Datenbankverbindung fehlt.",
  missing:"Bitte Titel, Startzeit und ggf. die freie Sitzungsart ausfüllen.",
  create:"Die Sitzung konnte nicht angelegt werden.",
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

function stateClass(state:string){
  if(state==="live") return "meeting-v3-state live";
  if(state==="ready") return "meeting-v3-state ready";
  if(state==="closing") return "meeting-v3-state closing";
  if(state==="minutes_draft") return "meeting-v3-state minutes_draft";
  if(state==="minutes_review") return "meeting-v3-state minutes_review";
  if(state==="archived") return "meeting-v3-state archived";
  if(state==="cancelled") return "meeting-v3-state cancelled";
  return "meeting-v3-state";
}

export default async function MeetingV3Dashboard({
  searchParams,
}:{
  searchParams:Promise<{error?:string}>;
}){
  const actor=await requirePermission("meetings.read");
  const params=await searchParams;
  const sql=getDb();
  const canWrite=hasPermission(actor.roles,"meetings.write");

  const [meetings,counts]=sql ? await Promise.all([
    sql`
      SELECT
        m.id::text,m.title,m.meeting_type,m.custom_type_label,m.lifecycle_state,
        m.meeting_mode,m.starts_at,m.location,m.minutes_status,
        (SELECT count(*)::int FROM meeting_v3_participants p WHERE p.meeting_id=m.id) AS participant_count,
        (SELECT count(*)::int FROM meeting_v3_agenda_items ai WHERE ai.meeting_id=m.id) AS agenda_count
      FROM meeting_v3_meetings m
      ORDER BY
        CASE m.lifecycle_state
          WHEN 'live' THEN 0
          WHEN 'ready' THEN 1
          WHEN 'preparation' THEN 2
          WHEN 'closing' THEN 3
          WHEN 'minutes_draft' THEN 4
          WHEN 'minutes_review' THEN 5
          WHEN 'archived' THEN 6
          ELSE 7
        END,
        CASE WHEN m.lifecycle_state IN ('preparation','ready','live','closing') THEN m.starts_at END ASC,
        m.starts_at DESC
      LIMIT 50
    `,
    sql`
      SELECT
        count(*) FILTER (WHERE lifecycle_state='preparation')::int AS preparation,
        count(*) FILTER (WHERE lifecycle_state='ready')::int AS ready,
        count(*) FILTER (WHERE lifecycle_state='live')::int AS live,
        count(*) FILTER (WHERE lifecycle_state IN ('minutes_draft','minutes_review'))::int AS minutes_open,
        count(*) FILTER (WHERE lifecycle_state='archived')::int AS archived
      FROM meeting_v3_meetings
    `,
  ]) : [[],[{preparation:0,ready:0,live:0,minutes_open:0,archived:0}]];

  const c=counts[0] ?? {};
  const active=meetings.filter((meeting)=>!["archived","cancelled"].includes(String(meeting.lifecycle_state)));
  const history=meetings.filter((meeting)=>["archived","cancelled"].includes(String(meeting.lifecycle_state)));

  return (
    <div className="page-stack meeting-v3-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Sitzungssystem V3</span>
          <h1>Neue Sitzungszentrale</h1>
          <p>
            Eigenständige Entwicklung auf dev2: geführte Vorbereitung, Live-Sitzung,
            Beschlüsse, Protokoll und Archiv in einem festen Ablauf.
          </p>
        </div>
        <span className="meeting-v3-preview-chip">Parallelbetrieb</span>
      </section>

      {params.error && <p className="form-error">{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</p>}

      <section className="stat-grid">
        <article className="stat-card"><span>Vorbereitung</span><strong>{Number(c.preparation ?? 0)}</strong><small>noch nicht freigegeben</small></article>
        <article className="stat-card"><span>Bereit</span><strong>{Number(c.ready ?? 0)}</strong><small>kann gestartet werden</small></article>
        <article className="stat-card"><span>Live</span><strong>{Number(c.live ?? 0)}</strong><small>aktuell laufend</small></article>
        <article className="stat-card"><span>Protokoll offen</span><strong>{Number(c.minutes_open ?? 0)}</strong><small>Entwurf oder Prüfung</small></article>
      </section>

      {canWrite && (
        <details className="panel meeting-v3-create" open={!meetings.length}>
          <summary>
            <div>
              <span className="eyebrow">Schnellstart</span>
              <strong>Neue Sitzung anlegen</strong>
              <small>Nur die Eckdaten – die Vorbereitung folgt geführt.</small>
            </div>
            <span className="count-chip">+</span>
          </summary>
          <form action={createMeetingV3Action} className="form-grid meeting-v3-create-form">
            <label>Titel
              <input name="title" required placeholder="z. B. Vorstandssitzung Oktober"/>
            </label>
            <label>Start
              <input name="startsAt" type="datetime-local" required/>
            </label>
            <label>Sitzungsart
              <select name="meetingType" defaultValue="board">
                <option value="board">Vorstandssitzung</option>
                <option value="general_assembly">Mitgliederversammlung</option>
                <option value="extraordinary">Außerordentliche Sitzung</option>
                <option value="custom">Freie Sitzung</option>
              </select>
            </label>
            <label>Format
              <select name="meetingMode" defaultValue="in_person">
                <option value="in_person">Präsenz</option>
                <option value="hybrid">Hybrid</option>
                <option value="online">Online</option>
              </select>
            </label>
            <label>Ort
              <input name="location" placeholder="z. B. Vereinsheim"/>
            </label>
            <label>Freie Sitzungsart
              <input name="customTypeLabel" placeholder="Nur bei „Freie Sitzung“"/>
            </label>
            <label className="meeting-v3-wide">Kurzbeschreibung
              <textarea name="description" rows={3} placeholder="Optional"/>
            </label>
            <div className="meeting-v3-wide meeting-v3-form-submit">
              <button className="primary-button" type="submit">Sitzung anlegen</button>
            </div>
          </form>
        </details>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Arbeitsbereich</span>
            <h2>Aktive Sitzungen</h2>
          </div>
          <span className="count-chip">{active.length}</span>
        </div>

        {active.length===0 ? (
          <p className="empty-state">Noch keine aktive V3-Sitzung vorhanden.</p>
        ) : (
          <div className="meeting-v3-list">
            {active.map((meeting)=>{
              const meetingId=String(meeting.id);
              const lifecycle=String(meeting.lifecycle_state);
              const href=lifecycle==="live"
                ? `/sitzungen/${meetingId}/live`
                : lifecycle==="ready"
                  ? `/sitzungen/${meetingId}/start`
                  : lifecycle==="closing"
                    ? `/sitzungen/${meetingId}/close`
                    : lifecycle==="minutes_draft" || lifecycle==="minutes_review"
                      ? `/sitzungen/${meetingId}/minutes`
                      : `/sitzungen/${meetingId}`;
              return (
              <Link href={href} className="meeting-v3-card" key={meetingId}>
                <div className="meeting-v3-card-main">
                  <span className="meeting-v3-type">
                    {String(meeting.meeting_type)==="custom"
                      ? String(meeting.custom_type_label || "Freie Sitzung")
                      : meetingV3TypeLabels[String(meeting.meeting_type) as MeetingV3Type] ?? String(meeting.meeting_type)}
                  </span>
                  <strong>{String(meeting.title)}</strong>
                  <small>{formatDateTime(meeting.starts_at)} · {meeting.location ? String(meeting.location) : "Ort offen"}</small>
                  <div className="meeting-v3-meta">
                    <span>{meetingV3ModeLabels[String(meeting.meeting_mode) as MeetingV3Mode] ?? String(meeting.meeting_mode)}</span>
                    <span>{Number(meeting.participant_count ?? 0)} Teilnehmer</span>
                    <span>{Number(meeting.agenda_count ?? 0)} TOPs</span>
                  </div>
                </div>
                <span className={stateClass(String(meeting.lifecycle_state))}>
                  {meetingV3StateLabels[String(meeting.lifecycle_state) as MeetingV3State] ?? String(meeting.lifecycle_state)}
                </span>
              </Link>
              );
            })}
          </div>
        )}
      </section>

      {history.length>0 && (
        <details className="panel meeting-v3-history">
          <summary>
            <div><span className="eyebrow">Historie</span><strong>Archiv & abgesagte Sitzungen</strong></div>
            <span className="count-chip">{history.length}</span>
          </summary>
          <div className="meeting-v3-list">
            {history.map((meeting)=>{
              const meetingId=String(meeting.id);
              const lifecycle=String(meeting.lifecycle_state);
              const href=lifecycle==="archived"
                ? `/sitzungen/${meetingId}/minutes`
                : `/sitzungen/${meetingId}`;
              return (
              <Link href={href} className="meeting-v3-card compact" key={meetingId}>
                <div className="meeting-v3-card-main">
                  <strong>{String(meeting.title)}</strong>
                  <small>{formatDateTime(meeting.starts_at)}</small>
                </div>
                <span className={stateClass(String(meeting.lifecycle_state))}>
                  {meetingV3StateLabels[String(meeting.lifecycle_state) as MeetingV3State] ?? String(meeting.lifecycle_state)}
                </span>
              </Link>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
