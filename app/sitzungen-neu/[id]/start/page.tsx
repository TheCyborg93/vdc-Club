import Link from "next/link";
import { redirect,notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import {
  startMeetingV3Action,
  updateMeetingV3ParticipantAction,
  updateMeetingV3QuorumAction,
} from "@/app/sitzungen-neu/live-actions";

export const dynamic="force-dynamic";

const errors:Record<string,string>={
  locked:"Die Sitzung ist nicht mehr im Startcheck.",
  attendance:"Bitte den Status aller Teilnehmer klären.",
  officers_present:"Sitzungsleitung und Protokollführung müssen als anwesend markiert sein.",
  quorum:"Die Beschlussfähigkeit muss vor dem Start bestätigt sein.",
  agenda:"Es ist kein offener TOP vorhanden.",
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

export default async function MeetingV3StartPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{error?:string;participant?:string;quorum?:string}>;
}) {
  await requirePermission("meetings.read");
  const {id}=await params;
  const query=await searchParams;
  const sql=getDb();
  if(!sql) notFound();

  const [rows,participants]=await Promise.all([
    sql`
      SELECT
        m.id::text,m.title,m.starts_at,m.location,m.lifecycle_state,m.quorum_confirmed,
        m.quorum_basis,m.quorum_note,m.chair_member_id::text AS chair_member_id,
        m.minute_taker_member_id::text AS minute_taker_member_id,
        chair.first_name AS chair_first_name,chair.last_name AS chair_last_name,
        minute.first_name AS minute_first_name,minute.last_name AS minute_last_name,
        (SELECT count(*)::int FROM meeting_v3_agenda_items ai
          WHERE ai.meeting_id=m.id AND ai.status IN ('open','active')) AS remaining_agenda
      FROM meeting_v3_meetings m
      LEFT JOIN members chair ON chair.id=m.chair_member_id
      LEFT JOIN members minute ON minute.id=m.minute_taker_member_id
      WHERE m.id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT
        p.id::text,p.member_id::text,p.attendance,p.voting_eligible,p.role_in_meeting,p.note,
        m.first_name,m.last_name
      FROM meeting_v3_participants p
      JOIN members m ON m.id=p.member_id
      WHERE p.meeting_id=${id}::uuid
      ORDER BY
        CASE p.role_in_meeting WHEN 'chair' THEN 0 WHEN 'minute_taker' THEN 1 ELSE 2 END,
        m.last_name,m.first_name
    `,
  ]);

  const meeting=rows[0];
  if(!meeting) notFound();

  const state=String(meeting.lifecycle_state);
  if(state==="live") redirect(`/sitzungen-neu/${id}/live`);
  if(state!=="ready") redirect(`/sitzungen-neu/${id}`);

  const unresolved=participants.filter((person)=>String(person.attendance)==="invited").length;
  const present=participants.filter((person)=>String(person.attendance)==="present").length;
  const eligible=participants.filter((person)=>String(person.attendance)==="present" && person.voting_eligible===true).length;
  const chairPresent=participants.some((person)=>String(person.member_id)===String(meeting.chair_member_id) && String(person.attendance)==="present");
  const minutePresent=participants.some((person)=>String(person.member_id)===String(meeting.minute_taker_member_id) && String(person.attendance)==="present");
  const quorumReady=meeting.quorum_confirmed===true;
  const agendaReady=Number(meeting.remaining_agenda ?? 0)>0;
  const canStart=unresolved===0 && present>0 && chairPresent && minutePresent && quorumReady && agendaReady;

  return (
    <div className="page-stack meeting-v3-page meeting-v3-start-page">
      <Link href={`/sitzungen-neu/${id}`} className="back-link">← Zur Vorbereitung</Link>

      <section className="meeting-v3-hero meeting-v3-start-hero">
        <div>
          <span className="eyebrow">Startcheck</span>
          <h1>{String(meeting.title)}</h1>
          <p>{formatDateTime(meeting.starts_at)} · {meeting.location ? String(meeting.location) : "Ort offen"}</p>
        </div>
        <div className="meeting-v3-start-summary">
          <span>{present} anwesend</span>
          <span>{eligible} stimmberechtigt</span>
          <span>{unresolved} ungeklärt</span>
        </div>
      </section>

      {query.error && <p className="form-error">{errors[query.error] ?? "Die Sitzung kann noch nicht gestartet werden."}</p>}
      {(query.participant || query.quorum) && <p className="form-success">Startcheck wurde aktualisiert.</p>}

      <section className="meeting-v3-start-progress">
        <article className={unresolved===0 ? "complete" : ""}>
          <b>1</b>
          <div><strong>Anwesenheit</strong><span>{unresolved===0 ? "Alle Teilnehmer geklärt" : `${unresolved} Status offen`}</span></div>
        </article>
        <article className={chairPresent && minutePresent ? "complete" : ""}>
          <b>2</b>
          <div><strong>Verantwortung</strong><span>{chairPresent && minutePresent ? "Leitung und Protokoll anwesend" : "Verantwortliche prüfen"}</span></div>
        </article>
        <article className={quorumReady ? "complete" : ""}>
          <b>3</b>
          <div><strong>Beschlussfähigkeit</strong><span>{quorumReady ? "Bestätigt" : "Noch bestätigen"}</span></div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">1 · Anwesenheit</span><h2>Wer ist tatsächlich da?</h2></div>
          <span className="count-chip">{present}/{participants.length}</span>
        </div>

        <div className="meeting-v3-start-participants">
          {participants.map((person)=>{
            const role=String(person.role_in_meeting);
            const isOfficer=role==="chair" || role==="minute_taker";
            return (
              <form action={updateMeetingV3ParticipantAction} className="meeting-v3-start-person" key={String(person.id)}>
                <input type="hidden" name="meetingId" value={id}/>
                <input type="hidden" name="participantId" value={String(person.id)}/>
                <input type="hidden" name="returnTo" value="start"/>
                <div className="meeting-v3-start-person-head">
                  <div>
                    <strong>{String(person.first_name)} {String(person.last_name)}</strong>
                    <span>{role==="chair" ? "Sitzungsleitung" : role==="minute_taker" ? "Protokollführung" : "Teilnehmer"}</span>
                  </div>
                  {isOfficer && <span className="meeting-v3-role-chip">{role==="chair" ? "Leitung" : "Protokoll"}</span>}
                </div>

                <div className="meeting-v3-start-person-fields">
                  <label>Anwesenheit
                    <select name="attendance" defaultValue={String(person.attendance)}>
                      <option value="invited">Noch ungeklärt</option>
                      <option value="present">Anwesend</option>
                      <option value="absent">Abwesend</option>
                      <option value="excused">Entschuldigt</option>
                      <option value="late">Kommt später</option>
                    </select>
                  </label>
                  <label>Stimmrecht
                    <select name="votingEligible" defaultValue={person.voting_eligible===true ? "yes" : "no"}>
                      <option value="yes">Stimmberechtigt</option>
                      <option value="no">Nicht stimmberechtigt</option>
                    </select>
                  </label>
                </div>

                <label>Notiz
                  <input name="note" defaultValue={String(person.note ?? "")} placeholder="Optional"/>
                </label>
                <button className="ghost-button" type="submit">Status speichern</button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="meeting-v3-work-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">2 · Verantwortung</span><h2>Leitung & Protokoll</h2></div>
          </div>
          <div className="meeting-v3-start-officers">
            <div className={chairPresent ? "complete" : ""}>
              <span>Sitzungsleitung</span>
              <strong>{meeting.chair_first_name ? `${meeting.chair_first_name} ${meeting.chair_last_name}` : "Nicht festgelegt"}</strong>
              <small>{chairPresent ? "Anwesend" : "Muss als anwesend markiert sein"}</small>
            </div>
            <div className={minutePresent ? "complete" : ""}>
              <span>Protokollführung</span>
              <strong>{meeting.minute_first_name ? `${meeting.minute_first_name} ${meeting.minute_last_name}` : "Nicht festgelegt"}</strong>
              <small>{minutePresent ? "Anwesend" : "Muss als anwesend markiert sein"}</small>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">3 · Beschlussfähigkeit</span><h2>Formell bestätigen</h2></div>
            <span className={quorumReady ? "meeting-v3-state archived" : "meeting-v3-state preparation"}>{quorumReady ? "Bestätigt" : "Offen"}</span>
          </div>

          <form action={updateMeetingV3QuorumAction} className="form-stack">
            <input type="hidden" name="meetingId" value={id}/>
            <input type="hidden" name="returnTo" value="start"/>
            <label>Beschlussfähig?
              <select name="quorumConfirmed" required defaultValue={meeting.quorum_confirmed==null ? "" : meeting.quorum_confirmed ? "yes" : "no"}>
                <option value="">Bitte auswählen</option>
                <option value="yes">Ja</option>
                <option value="no">Nein</option>
              </select>
            </label>
            <label>Grundlage / Satzung
              <input name="quorumBasis" defaultValue={String(meeting.quorum_basis ?? "")} placeholder="Optional"/>
            </label>
            <label>Bemerkung
              <textarea name="quorumNote" rows={3} defaultValue={String(meeting.quorum_note ?? "")} placeholder="Nur bei Besonderheiten nötig"/>
            </label>
            <button className="ghost-button" type="submit">Beschlussfähigkeit speichern</button>
          </form>
        </article>
      </section>

      <section className={canStart ? "meeting-v3-start-final complete" : "meeting-v3-start-final"}>
        <div>
          <span className="eyebrow">Sitzungsbeginn</span>
          <h2>{canStart ? "Alles bereit" : "Start noch gesperrt"}</h2>
          <p>
            {canStart
              ? "Beim Start wird der erste offene TOP automatisch aktiviert und die Live-Ansicht geöffnet."
              : "Klär zuerst Anwesenheit, Verantwortliche und Beschlussfähigkeit."}
          </p>
        </div>
        <form action={startMeetingV3Action}>
          <input type="hidden" name="meetingId" value={id}/>
          <button className="primary-button" type="submit" disabled={!canStart}>Sitzung starten</button>
        </form>
      </section>
    </div>
  );
}
