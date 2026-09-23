
import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  correctMeetingV3MinutesAgendaAction,
  correctMeetingV3MinutesFormalitiesAction,
  correctMeetingV3MinutesParticipantAction,
} from "@/app/sitzungen-neu/minutes-correction-actions";

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

function textValue(value:unknown,fallback=""){
  const text=String(value ?? "").trim();
  return text || fallback;
}

const errors:Record<string,string>={
  missing:"Bitte alle Pflichtfelder und einen Änderungsgrund ausfüllen.",
  locked:"Korrekturen sind nur am aktuellen Protokollentwurf möglich.",
};

const attendanceLabels:Record<string,string>={
  present:"Anwesend",
  absent:"Abwesend",
  excused:"Entschuldigt",
  late:"Verspätet",
  left_early:"Früher gegangen",
};

const resultLabels:Record<string,string>={
  noted:"Zur Kenntnis genommen",
  completed:"Erledigt",
  deferred:"Vertagt",
  resolution:"Beschluss gefasst",
  no_decision:"Keine Entscheidung",
};

export default async function MeetingV3MinutesCorrectionPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{error?:string;saved?:string}>;
}){
  const actor=await requirePermission("meetings.read");
  const routeParams=await params;
  const id=routeParams.id;
  const query=await searchParams;
  const sql=getDb();
  if(!sql) notFound();

  const results=await Promise.all([
    sql`
      SELECT
        m.id::text,m.title,m.lifecycle_state,m.minutes_status,m.current_minutes_revision,
        mr.snapshot,mr.change_reason,mr.created_at
      FROM meeting_v3_meetings m
      JOIN meeting_v3_minutes_revisions mr
        ON mr.meeting_id=m.id AND mr.revision=m.current_minutes_revision
      WHERE m.id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT mr.revision,mr.status,mr.change_reason,mr.created_at,
             au.display_name
      FROM meeting_v3_minutes_revisions mr
      LEFT JOIN app_users au ON au.id=mr.created_by
      WHERE mr.meeting_id=${id}::uuid
      ORDER BY mr.revision DESC
      LIMIT 12
    `,
  ]);
  const rows=results[0];
  const history=results[1];

  const meeting=rows[0];
  if(!meeting) notFound();

  if(String(meeting.lifecycle_state)!=="minutes_draft" || String(meeting.minutes_status)!=="draft"){
    redirect("/sitzungen-neu/"+id+"/minutes");
  }

  const canWrite=hasPermission(actor.roles,"meetings.write");
  if(!canWrite) redirect("/sitzungen-neu/"+id+"/minutes");

  const rawSnapshot=typeof meeting.snapshot==="string"
    ? JSON.parse(String(meeting.snapshot))
    : meeting.snapshot;
  const snapshot=asObject(rawSnapshot);
  const formal=asObject(snapshot.meeting);
  const participants=asArray(snapshot.participants);
  const agenda=asArray(snapshot.agenda);

  return (
    <div className="page-stack meeting-v3-page meeting-v3-correction-page">
      <section className="meeting-v3-correction-hero">
        <div>
          <span className="eyebrow">Strukturierte Nachbearbeitung</span>
          <h1>{String(meeting.title)}</h1>
          <p>Aktuelle Revision {Number(meeting.current_minutes_revision)} · Jede gespeicherte Korrektur erzeugt eine neue Revision.</p>
        </div>
        <Link href={"/sitzungen-neu/"+id+"/minutes"} className="ghost-button">Zur Protokollansicht</Link>
      </section>

      {query.error && <p className="form-error">{errors[query.error] ?? "Die Korrektur konnte nicht gespeichert werden."}</p>}
      {query.saved && (
        <p className="form-success">Korrektur gespeichert. Es wurde eine neue Protokollrevision erzeugt.</p>
      )}

      <section className="meeting-v3-correction-guide">
        <span className="eyebrow">Grundsatz</span>
        <strong>Keine freie Dokumentbearbeitung</strong>
        <p>Ändere nur die strukturierte Quelle. Dadurch bleiben Beschlüsse, Teilnehmerstand, TOP-Ergebnisse und jede frühere Protokollfassung nachvollziehbar.</p>
      </section>

      <details className="panel meeting-v3-correction-group" open>
        <summary>
          <div><span className="eyebrow">Formalia</span><strong>Rahmen & Beschlussfähigkeit</strong></div>
          <span className="count-chip">1</span>
        </summary>
        <form action={correctMeetingV3MinutesFormalitiesAction} className="meeting-v3-correction-form">
          <input type="hidden" name="meetingId" value={id}/>
          <label>Titel<input name="title" required defaultValue={textValue(formal.title,String(meeting.title))}/></label>
          <label>Ort<input name="location" defaultValue={textValue(formal.location)}/></label>
          <label>Grundlage / Satzung<input name="quorumBasis" defaultValue={textValue(formal.quorumBasis)}/></label>
          <label>Bemerkung Beschlussfähigkeit<textarea name="quorumNote" rows={3} defaultValue={textValue(formal.quorumNote)}/></label>
          <label className="meeting-v3-correction-wide">Änderungsgrund
            <textarea name="reason" rows={2} required placeholder="Warum muss diese Angabe korrigiert werden?"/>
          </label>
          <div className="meeting-v3-correction-wide meeting-v3-form-submit">
            <button className="ghost-button" type="submit">Formalia als neue Revision speichern</button>
          </div>
        </form>
      </details>

      <details className="panel meeting-v3-correction-group">
        <summary>
          <div><span className="eyebrow">Teilnahme</span><strong>Anwesenheit & Stimmrecht korrigieren</strong></div>
          <span className="count-chip">{participants.length}</span>
        </summary>
        <div className="meeting-v3-correction-list">
          {participants.map((person)=>(
            <form action={correctMeetingV3MinutesParticipantAction} className="meeting-v3-correction-person" key={textValue(person.memberId)+textValue(person.name)}>
              <input type="hidden" name="meetingId" value={id}/>
              <input type="hidden" name="memberId" value={textValue(person.memberId)}/>
              <div className="meeting-v3-correction-person-head">
                <strong>{textValue(person.name,"Mitglied")}</strong>
                <span>{textValue(person.role,"Teilnehmer")}</span>
              </div>
              <label>Anwesenheit
                <select name="attendance" defaultValue={textValue(person.attendance,"present")}>
                  {Object.entries(attendanceLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}
                </select>
              </label>
              <label>Stimmrecht
                <select name="votingEligible" defaultValue={person.votingEligible===true ? "yes" : "no"}>
                  <option value="yes">Stimmberechtigt</option>
                  <option value="no">Nicht stimmberechtigt</option>
                </select>
              </label>
              <label>Notiz<input name="note" defaultValue={textValue(person.note)} placeholder="Optional"/></label>
              <label className="meeting-v3-correction-wide">Änderungsgrund
                <input name="reason" required placeholder="Warum wird der Teilnehmerstatus korrigiert?"/>
              </label>
              <div className="meeting-v3-correction-wide meeting-v3-form-submit">
                <button className="mini-button" type="submit">Teilnehmer korrigieren</button>
              </div>
            </form>
          ))}
        </div>
      </details>

      <details className="panel meeting-v3-correction-group">
        <summary>
          <div><span className="eyebrow">Tagesordnung</span><strong>TOP-Texte & Ergebnisse korrigieren</strong></div>
          <span className="count-chip">{agenda.length}</span>
        </summary>
        <div className="meeting-v3-correction-list">
          {agenda.map((item)=>(
            <form action={correctMeetingV3MinutesAgendaAction} className="meeting-v3-correction-agenda" key={textValue(item.id)}>
              <input type="hidden" name="meetingId" value={id}/>
              <input type="hidden" name="agendaItemId" value={textValue(item.id)}/>
              <div className="meeting-v3-correction-agenda-head">
                <b>TOP {Number(item.position ?? 0)}</b>
                <span>{textValue(item.type)}</span>
              </div>
              <label>Titel<input name="title" required defaultValue={textValue(item.title)}/></label>
              <label>Sachverhalt / Vorbereitung<textarea name="description" rows={2} defaultValue={textValue(item.description)}/></label>
              <label>Protokollnotiz<textarea name="note" rows={5} defaultValue={textValue(item.note)}/></label>
              <label>Ergebnis
                <select name="resultCode" defaultValue={textValue(item.resultCode,"completed")}>
                  {Object.entries(resultLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}
                </select>
              </label>
              <label className="meeting-v3-correction-wide">Änderungsgrund
                <textarea name="reason" rows={2} required placeholder="Was wird korrigiert und warum?"/>
              </label>
              <div className="meeting-v3-correction-wide meeting-v3-form-submit">
                <button className="mini-button" type="submit">TOP als neue Revision speichern</button>
              </div>
            </form>
          ))}
        </div>
      </details>

      <details className="panel meeting-v3-correction-history">
        <summary>
          <div><span className="eyebrow">Revisionen</span><strong>Änderungsverlauf</strong></div>
          <span className="count-chip">{history.length}</span>
        </summary>
        <div className="meeting-v3-correction-history-list">
          {history.map((entry)=>(
            <div key={String(entry.revision)}>
              <b>v{Number(entry.revision)}</b>
              <div>
                <strong>{String(entry.status)}</strong>
                <span>{entry.change_reason ? String(entry.change_reason) : "Aus Sitzungsabschluss erzeugt"}</span>
              </div>
              <small>{entry.display_name ? String(entry.display_name) : "System"} · {new Intl.DateTimeFormat("de-DE",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(String(entry.created_at)))}</small>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
