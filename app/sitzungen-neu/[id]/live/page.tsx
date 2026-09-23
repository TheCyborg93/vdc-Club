import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  meetingV3AgendaTypeLabels,
  meetingV3CanControlLive,
  meetingV3ResultCodes,
  type MeetingV3AgendaType,
} from "@/lib/meeting-v3";
import {
  activateMeetingV3AgendaAction,
  completeMeetingV3AgendaAction,
  updateMeetingV3ParticipantAction,
  updateMeetingV3QuorumAction,
} from "@/app/sitzungen-neu/live-actions";
import { MeetingV3LiveNotes } from "@/components/meeting-v3-live-notes";

export const dynamic="force-dynamic";

const errors:Record<string,string>={
  locked:"Die Sitzung ist nicht mehr im Live-Modus.",
  agenda_active:"Es läuft bereits ein anderer TOP.",
  agenda_state:"Der TOP konnte in seinem aktuellen Zustand nicht abgeschlossen werden.",
};

const resultLabels:Record<string,string>={
  noted:"Zur Kenntnis genommen",
  completed:"Erledigt",
  deferred:"Vertagt",
  no_decision:"Keine Entscheidung",
};

function formatTime(value:unknown){
  if(!value) return "–";
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    hour:"2-digit",minute:"2-digit",timeZone:"Europe/Berlin",
  }).format(date);
}

export default async function MeetingV3LivePage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{
    error?:string;started?:string;agenda?:string;advanced?:string;
    agenda_complete?:string;participant?:string;quorum?:string;
  }>;
}) {
  const actor=await requirePermission("meetings.read");
  const {id}=await params;
  const query=await searchParams;
  const sql=getDb();
  if(!sql) notFound();

  const [rows,agenda,participants]=await Promise.all([
    sql`
      SELECT
        m.id::text,m.title,m.lifecycle_state,m.opened_at,m.quorum_confirmed,
        m.quorum_basis,m.quorum_note,m.chair_member_id::text,m.minute_taker_member_id::text
      FROM meeting_v3_meetings m
      WHERE m.id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT
        ai.id::text,ai.position,ai.title,ai.agenda_type,ai.description,
        ai.status,ai.result_code,ai.spontaneous,ai.spontaneous_reason,
        ai.started_at,ai.completed_at,
        COALESCE(note.content,'') AS note_content,
        COALESCE(note.version,0)::int AS note_version,
        (SELECT count(*)::int FROM meeting_v3_attachments a WHERE a.agenda_item_id=ai.id) AS attachment_count,
        (SELECT count(*)::int FROM meeting_v3_vote_exclusions e WHERE e.agenda_item_id=ai.id AND e.ended_at IS NULL) AS exclusion_count,
        (SELECT count(*)::int FROM meeting_v3_resolutions r WHERE r.agenda_item_id=ai.id) AS resolution_count
      FROM meeting_v3_agenda_items ai
      LEFT JOIN LATERAL (
        SELECT nv.content,nv.version
        FROM meeting_v3_note_versions nv
        WHERE nv.agenda_item_id=ai.id
        ORDER BY nv.version DESC
        LIMIT 1
      ) note ON true
      WHERE ai.meeting_id=${id}::uuid
      ORDER BY ai.position
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
  if(state==="ready") redirect(`/sitzungen-neu/${id}/start`);
  if(state!=="live") redirect(`/sitzungen-neu/${id}`);

  const canWrite=hasPermission(actor.roles,"meetings.write") && meetingV3CanControlLive(actor.roles);
  const current=agenda.find((item)=>String(item.status)==="active") ?? null;
  const open=agenda.filter((item)=>String(item.status)==="open");
  const finished=agenda.filter((item)=>["completed","deferred","skipped"].includes(String(item.status))).length;
  const present=participants.filter((person)=>String(person.attendance)==="present").length;
  const eligible=participants.filter((person)=>String(person.attendance)==="present" && person.voting_eligible===true).length;

  return (
    <div className="page-stack meeting-v3-page meeting-v3-live-page">
      <section className="meeting-v3-live-hero">
        <div>
          <span className="eyebrow">Live-Sitzung · seit {formatTime(meeting.opened_at)}</span>
          <h1>{String(meeting.title)}</h1>
          <p>{finished}/{agenda.length} TOPs abgeschlossen · {present} anwesend · {eligible} stimmberechtigt</p>
        </div>
        <div className="meeting-v3-live-hero-actions">
          <span className="meeting-v3-live-pill">LIVE</span>
          <Link href={`/sitzungen-neu/${id}`} className="ghost-button">Sitzungsakte</Link>
        </div>
      </section>

      {query.error && <p className="form-error">{errors[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</p>}
      {(query.started || query.agenda || query.advanced || query.participant || query.quorum) && (
        <p className="form-success">
          {query.started ? "Die Sitzung läuft. Der erste TOP wurde geöffnet." :
           query.advanced ? "TOP abgeschlossen. Der nächste TOP wurde automatisch geöffnet." :
           "Live-Sitzung wurde aktualisiert."}
        </p>
      )}

      <section className="meeting-v3-live-agenda">
        <div className="meeting-v3-live-agenda-head">
          <div><span className="eyebrow">Tagesordnung</span><strong>TOPs ({agenda.length})</strong></div>
          <span>{open.length + (current ? 1 : 0)} offen</span>
        </div>
        <div className="meeting-v3-live-agenda-strip">
          {agenda.map((item)=>{
            const status=String(item.status);
            return (
              <div
                className={[
                  "meeting-v3-live-agenda-chip",
                  status==="active" ? "active" : "",
                  status==="completed" ? "done" : "",
                  status==="deferred" ? "deferred" : "",
                ].filter(Boolean).join(" ")}
                key={String(item.id)}
              >
                <b>{Number(item.position)}</b>
                <div><strong>{String(item.title)}</strong><small>{status==="active" ? "In Bearbeitung" : status==="open" ? "Offen" : status==="deferred" ? "Vertagt" : "Erledigt"}</small></div>
              </div>
            );
          })}
        </div>
      </section>

      {current ? (
        <section className="meeting-v3-live-focus">
          <header className="meeting-v3-live-focus-head">
            <div>
              <span className="eyebrow">TOP {Number(current.position)}</span>
              <h2>{String(current.title)}</h2>
              <div className="meeting-v3-live-focus-meta">
                <span>{meetingV3AgendaTypeLabels[String(current.agenda_type) as MeetingV3AgendaType]}</span>
                {current.spontaneous && <span>Spontan ergänzt</span>}
                <span>seit {formatTime(current.started_at)}</span>
              </div>
            </div>
            <span className="meeting-v3-state live">In Bearbeitung</span>
          </header>

          <div className="meeting-v3-live-focus-body">
            {current.description && (
              <div className="meeting-v3-live-brief">
                <span className="eyebrow">Vorbereitung / Sachverhalt</span>
                <p>{String(current.description)}</p>
              </div>
            )}

            {canWrite ? (
              <MeetingV3LiveNotes
                meetingId={id}
                agendaItemId={String(current.id)}
                initialContent={String(current.note_content ?? "")}
                initialVersion={Number(current.note_version ?? 0)}
              />
            ) : (
              <div className="meeting-v3-live-notes readonly">
                <span className="eyebrow">Protokollnotizen</span>
                <p>{String(current.note_content || "Noch keine Notiz erfasst.")}</p>
              </div>
            )}

            <div className="meeting-v3-live-secondary">
              <div>
                <strong>Weitere TOP-Optionen</strong>
                <span>{Number(current.attachment_count ?? 0)} Anlagen · {Number(current.exclusion_count ?? 0)} Ausschlüsse · {Number(current.resolution_count ?? 0)} Beschlüsse</span>
              </div>
              <span className="meeting-v3-preview-chip">Beschlüsse & Befangenheit folgen im nächsten Block</span>
            </div>
          </div>

          {canWrite && (
            <footer className="meeting-v3-live-actions">
              <div>
                <span className="eyebrow">TOP abschließen</span>
                <strong>Ergebnis festlegen</strong>
              </div>
              <div className="meeting-v3-live-result-actions">
                {(meetingV3ResultCodes as readonly string[])
                  .filter((code)=>code!=="resolution")
                  .map((code)=>(
                    <form action={completeMeetingV3AgendaAction} key={code}>
                      <input type="hidden" name="meetingId" value={id}/>
                      <input type="hidden" name="agendaItemId" value={String(current.id)}/>
                      <input type="hidden" name="resultCode" value={code}/>
                      <button className={code==="completed" ? "primary-button" : "ghost-button"} type="submit">
                        {resultLabels[code] ?? code}
                      </button>
                    </form>
                  ))}
              </div>
            </footer>
          )}
        </section>
      ) : (
        <section className="panel meeting-v3-live-empty-focus">
          <div className="panel-head">
            <div>
              <span className="eyebrow">{open.length ? "Nächster Schritt" : "Tagesordnung erledigt"}</span>
              <h2>{open.length ? "Nächsten TOP starten" : "Alle TOPs sind abgeschlossen"}</h2>
            </div>
          </div>
          {open.length ? (
            <div className="meeting-v3-live-open-list">
              {open.map((item)=>(
                <form action={activateMeetingV3AgendaAction} key={String(item.id)}>
                  <input type="hidden" name="meetingId" value={id}/>
                  <input type="hidden" name="agendaItemId" value={String(item.id)}/>
                  <div><b>TOP {Number(item.position)}</b><strong>{String(item.title)}</strong></div>
                  <button className="primary-button" type="submit" disabled={!canWrite}>TOP starten</button>
                </form>
              ))}
            </div>
          ) : (
            <div className="meeting-v3-live-complete-note">
              <strong>Die Tagesordnung ist vollständig bearbeitet.</strong>
              <p>Als nächster V3-Schritt folgt der Abschluss-Assistent mit offenen Punkten, nächstem Termin und automatischem Protokollentwurf.</p>
            </div>
          )}
        </section>
      )}

      <details className="panel meeting-v3-live-check">
        <summary>
          <div>
            <span className="eyebrow">Sitzungscheck</span>
            <strong>Anwesenheit & Beschlussfähigkeit</strong>
          </div>
          <span className="count-chip">{present}/{participants.length}</span>
        </summary>

        <div className="meeting-v3-live-check-body">
          <div className="meeting-v3-live-check-stats">
            <div><span>Anwesend</span><strong>{present}</strong></div>
            <div><span>Stimmberechtigt</span><strong>{eligible}</strong></div>
            <div><span>Beschlussfähig</span><strong>{meeting.quorum_confirmed===true ? "Ja" : meeting.quorum_confirmed===false ? "Nein" : "Offen"}</strong></div>
          </div>

          {canWrite && (
            <>
              <div className="meeting-v3-live-participant-list">
                {participants.map((person)=>(
                  <form action={updateMeetingV3ParticipantAction} className="meeting-v3-live-person" key={String(person.id)}>
                    <input type="hidden" name="meetingId" value={id}/>
                    <input type="hidden" name="participantId" value={String(person.id)}/>
                    <input type="hidden" name="returnTo" value="live"/>
                    <div><strong>{String(person.first_name)} {String(person.last_name)}</strong><span>{String(person.role_in_meeting)==="chair" ? "Leitung" : String(person.role_in_meeting)==="minute_taker" ? "Protokoll" : "Teilnehmer"}</span></div>
                    <select name="attendance" defaultValue={String(person.attendance)} aria-label={`Anwesenheit ${person.first_name} ${person.last_name}`}>
                      <option value="present">Anwesend</option>
                      <option value="absent">Abwesend</option>
                      <option value="excused">Entschuldigt</option>
                      <option value="late">Kommt später</option>
                      <option value="left_early">Früher gegangen</option>
                    </select>
                    <select name="votingEligible" defaultValue={person.voting_eligible===true ? "yes" : "no"} aria-label={`Stimmrecht ${person.first_name} ${person.last_name}`}>
                      <option value="yes">Stimmberechtigt</option>
                      <option value="no">Nicht stimmberechtigt</option>
                    </select>
                    <input name="note" defaultValue={String(person.note ?? "")} placeholder="Notiz"/>
                    <button className="mini-button" type="submit">Speichern</button>
                  </form>
                ))}
              </div>

              <form action={updateMeetingV3QuorumAction} className="meeting-v3-live-quorum">
                <input type="hidden" name="meetingId" value={id}/>
                <input type="hidden" name="returnTo" value="live"/>
                <label>Beschlussfähig?
                  <select name="quorumConfirmed" required defaultValue={meeting.quorum_confirmed==null ? "" : meeting.quorum_confirmed ? "yes" : "no"}>
                    <option value="">Bitte auswählen</option><option value="yes">Ja</option><option value="no">Nein</option>
                  </select>
                </label>
                <label>Grundlage
                  <input name="quorumBasis" defaultValue={String(meeting.quorum_basis ?? "")} placeholder="Optional"/>
                </label>
                <label>Bemerkung
                  <input name="quorumNote" defaultValue={String(meeting.quorum_note ?? "")} placeholder="Optional"/>
                </label>
                <button className="ghost-button" type="submit">Beschlussfähigkeit aktualisieren</button>
              </form>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
