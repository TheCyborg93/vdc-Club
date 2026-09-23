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
import { beginMeetingV3ClosingAction } from "@/app/sitzungen-neu/closing-actions";
import {
  addMeetingV3VoteExclusionAction,
  addSpontaneousMeetingV3AgendaAction,
  createMeetingV3ResolutionAction,
  endMeetingV3VoteExclusionAction,
} from "@/app/sitzungen-neu/formal-actions";

export const dynamic="force-dynamic";

const errors:Record<string,string>={
  locked:"Die Sitzung ist nicht mehr im Live-Modus.",
  agenda_active:"Es läuft bereits ein anderer TOP.",
  agenda_state:"Der TOP konnte in seinem aktuellen Zustand nicht abgeschlossen werden.",
  spontaneous:"Für einen spontanen TOP sind Titel und Begründung erforderlich.",
  exclusion:"Der Stimmrechtsausschluss konnte nicht gespeichert werden.",
  resolution:"Der Beschluss konnte nicht gespeichert werden.",
  no_voters:"Für diesen TOP gibt es aktuell keine stimmberechtigte Person.",
  votes:"Die Stimmenzahlen sind ungültig.",
  vote_sum:"Ja, Nein und Enthaltung müssen zusammen exakt der Zahl der Stimmberechtigten entsprechen.",
  named_votes:"Bei namentlicher Abstimmung muss für jede stimmberechtigte Person eine Stimme erfasst werden.",
  task_permission:"Du darfst keine Folgeaufgaben anlegen.",
  resolution_required:"Der TOP kann erst als Beschluss abgeschlossen werden, wenn ein Beschluss erfasst wurde.",
  closing_not_ready:"Der Abschluss kann erst gestartet werden, wenn kein TOP mehr offen oder aktiv ist.",
};

const resultLabels:Record<string,string>={
  noted:"Zur Kenntnis genommen",
  completed:"Erledigt",
  deferred:"Vertagt",
  resolution:"Beschluss gefasst",
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
    spontaneous?:string;exclusion?:string;resolution?:string;
  }>;
}) {
  const actor=await requirePermission("meetings.read");
  const {id}=await params;
  const query=await searchParams;
  const sql=getDb();
  if(!sql) notFound();

  const [rows,agenda,participants,exclusions,resolutions]=await Promise.all([
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
    sql`
      SELECT
        e.id::text,e.agenda_item_id::text,e.member_id::text,e.reason,e.started_at,e.ended_at,
        m.first_name,m.last_name
      FROM meeting_v3_vote_exclusions e
      JOIN meeting_v3_agenda_items ai ON ai.id=e.agenda_item_id
      LEFT JOIN members m ON m.id=e.member_id
      WHERE ai.meeting_id=${id}::uuid
      ORDER BY e.started_at
    `,
    sql`
      SELECT
        r.id::text,r.agenda_item_id::text,r.resolution_number,r.title,r.decision_text,
        r.vote_method,r.eligible_voters,r.excluded_voters,r.votes_yes,r.votes_no,
        r.votes_abstain,r.decision_outcome,r.implementation_status,r.decided_at
      FROM meeting_v3_resolutions r
      WHERE r.meeting_id=${id}::uuid
      ORDER BY r.decided_at
    `,
  ]);

  const meeting=rows[0];
  if(!meeting) notFound();

  const state=String(meeting.lifecycle_state);
  if(state==="ready") redirect(`/sitzungen-neu/${id}/start`);
  if(state!=="live") redirect(`/sitzungen-neu/${id}`);

  const canWrite=hasPermission(actor.roles,"meetings.write") && meetingV3CanControlLive(actor.roles);
  const canResolve=hasPermission(actor.roles,"resolutions.write");
  const current=agenda.find((item)=>String(item.status)==="active") ?? null;
  const open=agenda.filter((item)=>String(item.status)==="open");
  const finished=agenda.filter((item)=>["completed","deferred","skipped"].includes(String(item.status))).length;
  const present=participants.filter((person)=>String(person.attendance)==="present").length;
  const eligible=participants.filter((person)=>String(person.attendance)==="present" && person.voting_eligible===true).length;
  const currentExclusions=current
    ? exclusions.filter((entry)=>String(entry.agenda_item_id)===String(current.id) && !entry.ended_at)
    : [];
  const currentResolutions=current
    ? resolutions.filter((entry)=>String(entry.agenda_item_id)===String(current.id))
    : [];
  const excludedMemberIds=new Set(currentExclusions.map((entry)=>String(entry.member_id ?? "")));
  const currentEligibleParticipants=participants.filter((person)=>
    String(person.attendance)==="present" &&
    person.voting_eligible===true &&
    !excludedMemberIds.has(String(person.member_id))
  );

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
      {(query.started || query.agenda || query.advanced || query.participant || query.quorum || query.spontaneous || query.exclusion || query.resolution) && (
        <p className="form-success">
          {query.started ? "Die Sitzung läuft. Der erste TOP wurde geöffnet." :
           query.advanced ? "TOP abgeschlossen. Der nächste TOP wurde automatisch geöffnet." :
           query.spontaneous ? "Spontaner TOP wurde aufgenommen." :
           query.exclusion ? "Befangenheit / Stimmrechtsausschluss wurde aktualisiert." :
           query.resolution ? "Beschluss wurde erfasst." :
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

      {canWrite && (
        <details className="meeting-v3-live-tool-drawer">
          <summary>
            <div><span className="eyebrow">Tagesordnung</span><strong>Spontanen TOP aufnehmen</strong></div>
            <span className="meeting-v3-preview-chip">+ TOP</span>
          </summary>
          <form action={addSpontaneousMeetingV3AgendaAction} className="meeting-v3-live-tool-form">
            <input type="hidden" name="meetingId" value={id}/>
            <label>Titel<input name="title" required placeholder="Neuer Tagesordnungspunkt"/></label>
            <label>Typ
              <select name="agendaType" defaultValue="consultation">
                <option value="information">Information</option>
                <option value="consultation">Beratung</option>
                <option value="decision">Beschluss</option>
              </select>
            </label>
            <label className="meeting-v3-live-tool-wide">Sachverhalt / Vorbereitung
              <textarea name="description" rows={3} placeholder="Optional"/>
            </label>
            <label className="meeting-v3-live-tool-wide">Warum muss der TOP jetzt behandelt werden?
              <textarea name="spontaneousReason" rows={2} required placeholder="Begründung für den nachträglichen TOP"/>
            </label>
            <div className="meeting-v3-live-tool-wide"><button className="ghost-button" type="submit">Spontanen TOP hinzufügen</button></div>
          </form>
        </details>
      )}

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
                <strong>Formale TOP-Optionen</strong>
                <span>{Number(current.attachment_count ?? 0)} Anlagen · {currentExclusions.length} Ausschlüsse · {currentResolutions.length} Beschlüsse</span>
              </div>
              <span className="meeting-v3-preview-chip">{currentEligibleParticipants.length} aktuell stimmberechtigt</span>
            </div>

            {canWrite && (
              <details className="meeting-v3-live-tool-drawer">
                <summary>
                  <div><span className="eyebrow">Befangenheit</span><strong>Stimmrechtsausschluss dokumentieren</strong></div>
                  <span className="count-chip">{currentExclusions.length}</span>
                </summary>
                <div className="meeting-v3-live-tool-body">
                  {currentExclusions.length>0 && (
                    <div className="meeting-v3-exclusion-list">
                      {currentExclusions.map((entry)=>(
                        <div key={String(entry.id)}>
                          <div><strong>{entry.first_name ? `${entry.first_name} ${entry.last_name}` : "Person"}</strong><span>{String(entry.reason)}</span></div>
                          <form action={endMeetingV3VoteExclusionAction}>
                            <input type="hidden" name="meetingId" value={id}/>
                            <input type="hidden" name="exclusionId" value={String(entry.id)}/>
                            <button className="mini-button" type="submit">Ausschluss beenden</button>
                          </form>
                        </div>
                      ))}
                    </div>
                  )}

                  <form action={addMeetingV3VoteExclusionAction} className="meeting-v3-live-tool-form">
                    <input type="hidden" name="meetingId" value={id}/>
                    <input type="hidden" name="agendaItemId" value={String(current.id)}/>
                    <label>Person
                      <select name="memberId" required defaultValue="">
                        <option value="">Person auswählen</option>
                        {participants
                          .filter((person)=>String(person.attendance)==="present" && person.voting_eligible===true && !excludedMemberIds.has(String(person.member_id)))
                          .map((person)=><option key={String(person.id)} value={String(person.member_id)}>{String(person.first_name)} {String(person.last_name)}</option>)}
                      </select>
                    </label>
                    <label>Grund<input name="reason" required placeholder="z. B. persönliches Interesse"/></label>
                    <div className="meeting-v3-live-tool-wide"><button className="ghost-button" type="submit">Ausschluss dokumentieren</button></div>
                  </form>
                </div>
              </details>
            )}

            {currentResolutions.length>0 && (
              <div className="meeting-v3-resolution-list">
                {currentResolutions.map((resolution)=>(
                  <article key={String(resolution.id)}>
                    <div>
                      <span className="eyebrow">{String(resolution.resolution_number)}</span>
                      <strong>{String(resolution.title)}</strong>
                      <p>{String(resolution.decision_text)}</p>
                    </div>
                    <div className="meeting-v3-resolution-vote">
                      <span>Ja {Number(resolution.votes_yes)}</span>
                      <span>Nein {Number(resolution.votes_no)}</span>
                      <span>Enth. {Number(resolution.votes_abstain)}</span>
                      <b>{String(resolution.decision_outcome)==="accepted" ? "Angenommen" : "Abgelehnt"}</b>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {canResolve && (
              <details className="meeting-v3-live-tool-drawer meeting-v3-resolution-drawer">
                <summary>
                  <div><span className="eyebrow">Beschluss</span><strong>Beschluss erfassen</strong></div>
                  <span className="meeting-v3-preview-chip">{currentEligibleParticipants.length} Stimmen</span>
                </summary>
                <form action={createMeetingV3ResolutionAction} className="meeting-v3-resolution-form">
                  <input type="hidden" name="meetingId" value={id}/>
                  <input type="hidden" name="agendaItemId" value={String(current.id)}/>
                  <label>Titel<input name="title" required defaultValue={String(current.title)}/></label>
                  <label>Abstimmungsart
                    <select name="voteMethod" defaultValue="show_of_hands">
                      <option value="show_of_hands">Handzeichen</option>
                      <option value="open">Offen</option>
                      <option value="roll_call">Namentlich</option>
                      <option value="secret">Geheim</option>
                    </select>
                  </label>
                  <label className="meeting-v3-live-tool-wide">Beschlusstext
                    <textarea name="decisionText" rows={4} required placeholder="Was wurde konkret beschlossen?"/>
                  </label>

                  <div className="meeting-v3-live-tool-wide meeting-v3-vote-context">
                    <strong>Aktuell {currentEligibleParticipants.length} stimmberechtigte Person(en)</strong>
                    <span>Anwesende Stimmberechtigte abzüglich aktiver Befangenheits-/Stimmrechtsausschlüsse.</span>
                  </div>

                  <div className="meeting-v3-vote-grid">
                    <label>Ja<input name="votesYes" type="number" min="0" defaultValue="0"/></label>
                    <label>Nein<input name="votesNo" type="number" min="0" defaultValue="0"/></label>
                    <label>Enthaltung<input name="votesAbstain" type="number" min="0" defaultValue="0"/></label>
                  </div>

                  <details className="meeting-v3-named-votes meeting-v3-live-tool-wide">
                    <summary>Namentliche Stimmen erfassen</summary>
                    <p>Nur erforderlich, wenn oben „Namentlich“ gewählt wurde.</p>
                    <div>
                      {currentEligibleParticipants.map((person)=>(
                        <label key={String(person.id)}>{String(person.first_name)} {String(person.last_name)}
                          <select name={`vote_${String(person.member_id)}`} defaultValue="">
                            <option value="">Bitte wählen</option>
                            <option value="yes">Ja</option>
                            <option value="no">Nein</option>
                            <option value="abstain">Enthaltung</option>
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>

                  <details className="meeting-v3-resolution-task meeting-v3-live-tool-wide">
                    <summary>Folgeaufgabe anlegen</summary>
                    <label className="meeting-v3-checkbox-row"><input type="checkbox" name="createTask" value="yes"/> Bei angenommenem Beschluss Aufgabe erzeugen</label>
                    <label>Aufgabentitel<input name="taskTitle" placeholder={`Beschluss umsetzen: ${String(current.title)}`}/></label>
                    <label>Verantwortlich
                      <select name="ownerMemberId" defaultValue="">
                        <option value="">Noch offen</option>
                        {participants.map((person)=><option key={String(person.id)} value={String(person.member_id)}>{String(person.first_name)} {String(person.last_name)}</option>)}
                      </select>
                    </label>
                    <label>Frist<input name="dueDate" type="date"/></label>
                    <label>Beschreibung<textarea name="taskDescription" rows={2} placeholder="Optional"/></label>
                  </details>

                  <div className="meeting-v3-live-tool-wide"><button className="primary-button" type="submit">Beschluss speichern</button></div>
                </form>
              </details>
            )}
          </div>

          {canWrite && (
            <footer className="meeting-v3-live-actions">
              <div>
                <span className="eyebrow">TOP abschließen</span>
                <strong>Ergebnis festlegen</strong>
              </div>
              <div className="meeting-v3-live-result-actions">
                {(meetingV3ResultCodes as readonly string[])
                  .filter((code)=>code!=="resolution" || currentResolutions.length>0)
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
              <p>Jetzt folgt der Abschluss-Assistent mit Zusammenfassung, vertagten TOPs, nächstem Termin und automatischem Protokollentwurf.</p>
              {canWrite && (
                <form action={beginMeetingV3ClosingAction}>
                  <input type="hidden" name="meetingId" value={id}/>
                  <button className="primary-button" type="submit">Sitzungsabschluss starten</button>
                </form>
              )}
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
