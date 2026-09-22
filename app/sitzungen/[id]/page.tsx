import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  addAgendaItemAction,
  addAttendeeAction,
  createResolutionFromAgendaAction,
  deleteAgendaItemAction,
  updateAgendaNotesAction,
  updateAgendaStatusAction,
  updateAttendanceAction,
  updateMeetingDetailsAction,
  updateMeetingOfficersAction,
  updateMeetingStatusAction,
} from "@/app/sitzungen/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MeetingAutoNotes } from "@/components/meeting-auto-notes";
import { meetingStatusLabel,taskStatusLabel } from "@/lib/ui-labels";

const attendanceLabels:Record<string,string>={
  invited:"Eingeladen",
  present:"Anwesend",
  absent:"Abwesend",
  excused:"Entschuldigt",
};

const minutesStatusLabels:Record<string,string>={
  draft:"Entwurf",
  review:"In Prüfung",
  approved:"Freigegeben",
  archived:"Archiviert",
};

const agendaLabels:Record<string,string>={
  open:"Offen",
  active:"In Bearbeitung",
  done:"Erledigt",
  deferred:"Vertagt",
};

const errors:Record<string,string>={
  missing:"Bitte alle erforderlichen Angaben ausfüllen.",
  attendee:"Teilnehmer konnte nicht hinzugefügt werden.",
  resolution:"Für einen Beschluss werden Titel und Beschlusstext benötigt.",
  protected_delete:"Diese Sitzung kann nicht gelöscht werden, weil sie bereits abgeschlossen ist oder Beschlüsse/Dokumente enthält.",
  agenda_delete:"Dieser TOP kann nicht gelöscht werden, weil bereits ein Beschluss dazu existiert oder die Sitzung abgeschlossen ist.",
  meeting_locked:"Diese Änderung ist im aktuellen Sitzungsstatus nicht möglich.",
  open_agenda:"Die Sitzung kann noch nicht beendet werden. Offene oder aktive TOPs müssen zuerst erledigt oder vertagt werden.",
  attendance_open:"Die Sitzung kann noch nicht beendet werden. Bei allen eingeladenen Personen muss die Anwesenheit geklärt sein.",
  invalid_transition:"Dieser Statuswechsel ist nicht zulässig.",
};

export const dynamic="force-dynamic";

function formatDateTime(value:unknown) {
  if (!value) return "";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE",{
    weekday:"long",
    day:"2-digit",
    month:"long",
    year:"numeric",
    hour:"2-digit",
    minute:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

function dateTimeLocal(value:unknown) {
  if (!value) return "";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const parts=new Intl.DateTimeFormat("en-CA",{
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23",
    timeZone:"Europe/Berlin",
  }).formatToParts(date);
  const map=Object.fromEntries(parts.map((part)=>[part.type,part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export default async function MeetingDetailPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{
    top?:string;
    error?:string;
    agenda?:string;
    resolution?:string;
    created?:string;
    agenda_deleted?:string;
    notes?:string;
    saved?:string;
    status?:string;
    officers?:string;
  }>;
}) {
  const actor=await requirePermission("meetings.read");
  const sql=getDb();
  if (!sql) notFound();

  const {id}=await params;
  const query=await searchParams;

  const [meetingRows,agenda,attendees,members]=await Promise.all([
    sql`
      SELECT
        m.id::text,
        m.title,
        m.starts_at,
        m.location,
        m.status,
        m.notes,
        m.ended_at,
        m.chair_member_id::text,
        m.minute_taker_member_id::text,
        m.minutes_status,
        e.id::text AS event_id
      FROM meetings m
      LEFT JOIN club_events e ON e.id=m.event_id
      WHERE m.id=${id}::uuid
        AND m.deleted_at IS NULL
      LIMIT 1
    `,
    sql`
      SELECT
        ai.id::text,
        ai.position,
        ai.title,
        ai.description,
        ai.notes,
        ai.status,
        r.id::text AS resolution_id,
        r.resolution_number,
        r.title AS resolution_title,
        r.decision_text,
        r.votes_yes,
        r.votes_no,
        r.votes_abstain,
        r.status AS resolution_status,
        t.id::text AS task_id,
        t.status AS task_status
      FROM agenda_items ai
      LEFT JOIN resolutions r ON r.agenda_item_id=ai.id
      LEFT JOIN LATERAL (
        SELECT tx.id,tx.status
        FROM tasks tx
        WHERE tx.source_type='resolution'
          AND tx.source_id=r.id
          AND tx.deleted_at IS NULL
        ORDER BY tx.created_at DESC
        LIMIT 1
      ) t ON true
      WHERE ai.meeting_id=${id}::uuid
      ORDER BY ai.position
    `,
    sql`
      SELECT
        ma.member_id::text,
        ma.attendance,
        m.first_name,
        m.last_name
      FROM meeting_attendees ma
      JOIN members m ON m.id=ma.member_id
      WHERE ma.meeting_id=${id}::uuid
      ORDER BY m.last_name,m.first_name
    `,
    sql`
      SELECT id::text,first_name,last_name
      FROM members
      WHERE status='active'
      ORDER BY last_name,first_name
    `,
  ]);

  const meeting=meetingRows[0];
  if (!meeting) notFound();

  const canWrite=hasPermission(actor.roles,"meetings.write");
  const canResolve=hasPermission(actor.roles,"resolutions.write");
  const canCreateTasks=hasPermission(actor.roles,"tasks.write");
  const minutesStatus=String(meeting.minutes_status ?? "draft");

  const invitedIds=new Set(attendees.map((row)=>String(row.member_id)));
  const availableMembers=members.filter((row)=>!invitedIds.has(String(row.id)));
  const presentCount=attendees.filter((row)=>row.attendance==="present").length;
  const unresolvedAttendanceCount=attendees.filter((row)=>row.attendance==="invited").length;
  const openAgendaCount=agenda.filter((row)=>["open","active"].includes(String(row.status))).length;
  const meetingEditable=["planned","cancelled"].includes(String(meeting.status));
  const meetingRunning=meeting.status==="running";

  const preferredAgenda=
    agenda.find((row)=>String(row.id)===query.top)
    ?? agenda.find((row)=>row.status==="active")
    ?? agenda.find((row)=>row.status==="open")
    ?? agenda[0]
    ?? null;

  const activeIndex=preferredAgenda
    ? agenda.findIndex((row)=>String(row.id)===String(preferredAgenda.id))
    : -1;
  const previousAgenda=activeIndex>0 ? agenda[activeIndex-1] : null;
  const nextAgenda=activeIndex>=0 && activeIndex<agenda.length-1 ? agenda[activeIndex+1] : null;

  return (
    <div className="page-stack meeting-control-page">
      <section className="meeting-control-hero">
        <div>
          <Link href="/sitzungen" className="back-link">← Sitzungen</Link>
          <div className="meeting-control-title">
            <img src="/vdc-logo.svg" alt="" />
            <div>
              <span className="eyebrow">Vorstandssitzung · Sitzungsmodus</span>
              <h1>{String(meeting.title)}</h1>
              <p>{formatDateTime(meeting.starts_at)} · {meeting.location ? String(meeting.location) : "Ort offen"}</p>
            </div>
          </div>
        </div>

        <div className="meeting-control-tools">
          <Link href={`/sitzungen/${id}/protokoll`} className="ghost-button">
            Schriftführer · {minutesStatusLabels[minutesStatus] ?? minutesStatus}
          </Link>
          <b className={`status-badge status-${meeting.status}`}>{meetingStatusLabel(meeting.status)}</b>

          {canWrite && meeting.status==="planned" && (
            <form action={updateMeetingStatusAction}>
              <input type="hidden" name="meetingId" value={id} />
              <input type="hidden" name="status" value="running" />
              <button className="primary-button">Sitzung starten</button>
            </form>
          )}

          {canWrite && meeting.status==="cancelled" && (
            <form action={updateMeetingStatusAction}>
              <input type="hidden" name="meetingId" value={id} />
              <input type="hidden" name="status" value="planned" />
              <button className="primary-button">Wieder planen</button>
            </form>
          )}

          {canWrite && meeting.status==="completed" && (
            <form action={updateMeetingStatusAction}>
              <input type="hidden" name="meetingId" value={id} />
              <input type="hidden" name="status" value="running" />
              <ConfirmSubmitButton
                message="Sitzung wieder öffnen? Das Ende wird zurückgesetzt und die Sitzung kann weiter bearbeitet werden."
                className="mini-button"
              >
                Wieder öffnen
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
      </section>

      {query.error && <div className="form-error">{errors[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(query.agenda || query.resolution || query.created || query.saved || query.status || query.officers) && <div className="form-success">Sitzung wurde aktualisiert.</div>}
      {query.notes && <div className="form-success">Ergebnisnotiz wurde gespeichert.</div>}
      {query.agenda_deleted && <div className="form-success">TOP wurde gelöscht.</div>}

      <section className="meeting-control-stats">
        <article><span>TOPs</span><strong>{agenda.length}</strong><small>{openAgendaCount} offen</small></article>
        <article><span>Anwesend</span><strong>{presentCount}/{attendees.length}</strong><small>{unresolvedAttendanceCount ? unresolvedAttendanceCount+" ungeklärt" : "vollständig erfasst"}</small></article>
        <article><span>Beschlüsse</span><strong>{agenda.filter((row)=>row.resolution_id).length}</strong><small>in dieser Sitzung</small></article>
        <article><span>Status</span><strong>{meetingStatusLabel(meeting.status)}</strong><small>{meeting.ended_at ? "beendet "+formatDateTime(meeting.ended_at) : "aktueller Sitzungsstand"}</small></article>
      </section>

      <section className="meeting-secretary-setup">
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Protokollorganisation</span>
              <h2>Sitzungsleitung & Protokollführung</h2>
            </div>
            <b className={"minutes-status minutes-"+minutesStatus}>
              {minutesStatusLabels[minutesStatus] ?? minutesStatus}
            </b>
          </div>

          {canWrite && minutesStatus!=="archived" ? (
            <form action={updateMeetingOfficersAction} className="meeting-officer-form">
              <input type="hidden" name="meetingId" value={id} />
              <label>
                Sitzungsleitung
                <select name="chairMemberId" defaultValue={String(meeting.chair_member_id ?? "")}>
                  <option value="">Noch nicht festgelegt</option>
                  {members.map((member)=>(
                    <option key={String(member.id)} value={String(member.id)}>
                      {String(member.first_name)} {String(member.last_name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Protokollführung
                <select
                  name="minuteTakerMemberId"
                  defaultValue={String(meeting.minute_taker_member_id ?? actor.memberId ?? "")}
                >
                  <option value="">Noch nicht festgelegt</option>
                  {members.map((member)=>(
                    <option key={String(member.id)} value={String(member.id)}>
                      {String(member.first_name)} {String(member.last_name)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="mini-button" type="submit">Rollen speichern</button>
            </form>
          ) : (
            <div className="meeting-officer-readonly">
              <span>Die Rollen können im archivierten Protokoll nicht mehr verändert werden.</span>
            </div>
          )}

          <div className="meeting-protocol-shortcut">
            <div>
              <strong>Schriftführer-Arbeitsplatz</strong>
              <span>Einleitung, Abschluss, Prüfung, Freigabe und Archivierung des Protokolls.</span>
            </div>
            <Link href={`/sitzungen/${id}/protokoll`} className="primary-button">Protokoll öffnen</Link>
          </div>
        </article>
      </section>

      <section className="meeting-session-shell">
        <aside className="meeting-top-rail">
          <div className="meeting-top-rail-head">
            <div><span className="eyebrow">Tagesordnung</span><h2>TOPs ({agenda.length})</h2></div>
            <span>{openAgendaCount} offen</span>
          </div>

          <nav className="meeting-top-list" aria-label="Tagesordnung">
            {agenda.length===0 ? (
              <div className="compact-empty">Noch keine TOPs vorhanden.</div>
            ) : agenda.map((item)=>(
              <Link
                href={`/sitzungen/${id}?top=${String(item.id)}`}
                key={String(item.id)}
                className={`meeting-top-link top-${item.status} ${preferredAgenda && String(preferredAgenda.id)===String(item.id) ? "is-current" : ""}`}
              >
                <span className="meeting-top-number">{Number(item.position)}</span>
                <div>
                  <strong>{String(item.title)}</strong>
                  <small>{agendaLabels[String(item.status)] ?? String(item.status)}</small>
                </div>
                {item.resolution_id && <b>✓</b>}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="meeting-focus-panel">
          {!preferredAgenda ? (
            <div className="meeting-focus-empty">
              <img src="/vdc-logo.svg" alt="" />
              <h2>Noch keine Tagesordnung</h2>
              <p>Lege unten den ersten TOP für diese Sitzung an.</p>
            </div>
          ) : (
            <>
              <header className="meeting-focus-head">
                <div>
                  <span className="eyebrow">TOP {Number(preferredAgenda.position)}</span>
                  <h2>{String(preferredAgenda.title)}</h2>
                </div>
                <div className="meeting-focus-status">
                  <span>Status</span>
                  <b className={`agenda-status agenda-${preferredAgenda.status}`}>
                    {agendaLabels[String(preferredAgenda.status)] ?? String(preferredAgenda.status)}
                  </b>
                </div>
              </header>

              <div className="meeting-focus-content">
                <section className="meeting-focus-section">
                  <span>Inhalt / Notizen</span>
                  {preferredAgenda.description ? (
                    <p>{String(preferredAgenda.description)}</p>
                  ) : (
                    <p className="muted-copy">Keine Beschreibung hinterlegt.</p>
                  )}

                  {meetingRunning && canWrite ? (
                    <MeetingAutoNotes
                      meetingId={id}
                      agendaItemId={String(preferredAgenda.id)}
                      initialValue={preferredAgenda.notes ? String(preferredAgenda.notes) : ""}
                    />
                  ) : preferredAgenda.notes ? (
                    <div className="meeting-read-note">{String(preferredAgenda.notes)}</div>
                  ) : null}
                </section>

                <section className="meeting-focus-section">
                  <div className="meeting-section-head">
                    <span>Beschluss</span>
                    {preferredAgenda.resolution_number && <b>{String(preferredAgenda.resolution_number)}</b>}
                  </div>

                  {preferredAgenda.resolution_id ? (
                    <div className="meeting-resolution-summary">
                      <strong>{String(preferredAgenda.resolution_title)}</strong>
                      <p>{String(preferredAgenda.decision_text)}</p>
                      <div>
                        <span>Ja <b>{Number(preferredAgenda.votes_yes)}</b></span>
                        <span>Nein <b>{Number(preferredAgenda.votes_no)}</b></span>
                        <span>Enthaltung <b>{Number(preferredAgenda.votes_abstain)}</b></span>
                        {preferredAgenda.task_id && (
                          <span>Aufgabe <b>{taskStatusLabel(preferredAgenda.task_status)}</b></span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="meeting-no-resolution">
                      <p>Noch kein Beschluss zu diesem TOP erfasst.</p>
                      {canResolve && meetingRunning && <span>Über die Aktionsleiste kannst du einen Beschluss erfassen.</span>}
                    </div>
                  )}
                </section>

                {meetingRunning && canWrite && !preferredAgenda.resolution_id && preferredAgenda.status!=="active" && (
                  <form action={updateAgendaStatusAction} className="meeting-focus-start">
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                    <input type="hidden" name="status" value="active" />
                    <button className="primary-button">Diesen TOP jetzt behandeln</button>
                  </form>
                )}

                {canWrite && ["planned","running"].includes(String(meeting.status)) && !preferredAgenda.resolution_id && (
                  <form action={deleteAgendaItemAction} className="meeting-top-delete">
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                    <ConfirmSubmitButton message={"TOP „"+String(preferredAgenda.title)+"“ wirklich löschen?"}>
                      TOP löschen
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>

              <footer className="meeting-action-bar">
                {previousAgenda ? (
                  <Link href={`/sitzungen/${id}?top=${String(previousAgenda.id)}`} className="meeting-action secondary">← Zurück</Link>
                ) : (
                  <span className="meeting-action secondary is-disabled">← Zurück</span>
                )}

                <div className="meeting-action-center">
                  {meetingRunning && canWrite && !preferredAgenda.resolution_id && !["done","deferred"].includes(String(preferredAgenda.status)) && (
                    <>
                      <form action={updateAgendaStatusAction}>
                        <input type="hidden" name="meetingId" value={id} />
                        <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                        <input type="hidden" name="status" value="done" />
                        <button className="meeting-action success">TOP erledigen</button>
                      </form>
                      <form action={updateAgendaStatusAction}>
                        <input type="hidden" name="meetingId" value={id} />
                        <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                        <input type="hidden" name="status" value="deferred" />
                        <button className="meeting-action secondary">Vertagen</button>
                      </form>
                    </>
                  )}

                  {canResolve && meetingRunning && !preferredAgenda.resolution_id && (
                    <details className="meeting-resolution-drawer">
                      <summary className="meeting-action danger">Beschluss erfassen</summary>
                      <div className="resolution-drawer-panel">
                        <div className="resolution-drawer-head">
                          <div>
                            <span className="eyebrow">TOP {Number(preferredAgenda.position)}</span>
                            <h3>Beschluss erfassen</h3>
                          </div>
                          <span>Erneut auf „Beschluss erfassen“ klicken zum Schließen.</span>
                        </div>
                        <form action={createResolutionFromAgendaAction} className="form-stack">
                          <input type="hidden" name="meetingId" value={id} />
                          <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                          <label>Titel<input name="title" defaultValue={String(preferredAgenda.title)} required /></label>
                          <label>Beschlusstext<textarea name="decisionText" rows={4} required /></label>
                          <div className="vote-input-grid">
                            <label>Ja<input name="votesYes" type="number" min="0" defaultValue="0" /></label>
                            <label>Nein<input name="votesNo" type="number" min="0" defaultValue="0" /></label>
                            <label>Enthaltung<input name="votesAbstain" type="number" min="0" defaultValue="0" /></label>
                          </div>

                          {canCreateTasks && (
                            <>
                              <label className="checkbox-row">
                                <input type="checkbox" name="createTask" />
                                <span>Direkt Folgeaufgabe erzeugen</span>
                              </label>
                              <div className="form-grid">
                                <label>Verantwortlich
                                  <select name="taskOwner" defaultValue="">
                                    <option value="">Noch offen</option>
                                    {members.map((member)=>(
                                      <option key={String(member.id)} value={String(member.id)}>
                                        {String(member.first_name)} {String(member.last_name)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>Frist<input name="taskDueDate" type="date" /></label>
                              </div>
                            </>
                          )}

                          <button className="primary-button" type="submit">Beschluss speichern</button>
                        </form>
                      </div>
                    </details>
                  )}
                </div>

                {nextAgenda ? (
                  <Link href={`/sitzungen/${id}?top=${String(nextAgenda.id)}`} className="meeting-action primary">Weiter →</Link>
                ) : (
                  <span className="meeting-action primary is-disabled">Weiter →</span>
                )}
              </footer>
            </>
          )}
        </article>
      </section>

      {meetingRunning && canWrite && (
        <section className="meeting-finish-strip">
          <div>
            <strong>Sitzung abschließen</strong>
            <span>
              {openAgendaCount>0
                ? openAgendaCount+" offene/aktive TOPs müssen zuerst erledigt oder vertagt werden."
                : unresolvedAttendanceCount>0
                  ? unresolvedAttendanceCount+" Anwesenheiten sind noch ungeklärt."
                  : "Alle Voraussetzungen sind erfüllt."}
            </span>
          </div>
          <form action={updateMeetingStatusAction}>
            <input type="hidden" name="meetingId" value={id} />
            <input type="hidden" name="status" value="completed" />
            <button
              className="light-button"
              disabled={openAgendaCount>0 || unresolvedAttendanceCount>0}
            >
              Sitzung beenden
            </button>
          </form>
        </section>
      )}

      <section className="meeting-management-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Teilnehmer</span><h2>Anwesenheit</h2></div>
            <span className="count-chip">{presentCount}/{attendees.length}</span>
          </div>

          <div className="attendee-list">
            {attendees.length===0 ? (
              <div className="empty-state">Noch niemand eingeladen.</div>
            ) : attendees.map((attendee)=>(
              <div className="attendee-row" key={String(attendee.member_id)}>
                <div className="member-avatar">
                  {String(attendee.first_name).slice(0,1)}{String(attendee.last_name).slice(0,1)}
                </div>
                <div>
                  <strong>{String(attendee.first_name)} {String(attendee.last_name)}</strong>
                  <span>{attendanceLabels[String(attendee.attendance)] ?? String(attendee.attendance)}</span>
                </div>

                {canWrite && ["planned","running"].includes(String(meeting.status)) && (
                  <form action={updateAttendanceAction}>
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="memberId" value={String(attendee.member_id)} />
                    <select name="attendance" defaultValue={String(attendee.attendance)}>
                      <option value="invited">Eingeladen</option>
                      <option value="present">Anwesend</option>
                      <option value="absent">Abwesend</option>
                      <option value="excused">Entschuldigt</option>
                    </select>
                    <button className="mini-button">Speichern</button>
                  </form>
                )}
              </div>
            ))}
          </div>

          {canWrite && ["planned","running"].includes(String(meeting.status)) && availableMembers.length>0 && (
            <form action={addAttendeeAction} className="form-stack attendee-add-form">
              <input type="hidden" name="meetingId" value={id} />
              <label>Teilnehmer hinzufügen
                <select name="memberId" defaultValue="" required>
                  <option value="" disabled>Mitglied auswählen</option>
                  {availableMembers.map((member)=>(
                    <option key={String(member.id)} value={String(member.id)}>
                      {String(member.first_name)} {String(member.last_name)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="ghost-button" type="submit">Hinzufügen</button>
            </form>
          )}
        </article>

        {canWrite && ["planned","running"].includes(String(meeting.status)) && (
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Tagesordnung</span><h2>TOP hinzufügen</h2></div>
            </div>
            <form action={addAgendaItemAction} className="form-stack">
              <input type="hidden" name="meetingId" value={id} />
              <label>Titel<input name="title" required /></label>
              <label>Beschreibung<textarea name="description" rows={3} /></label>
              <button className="primary-button" type="submit">TOP hinzufügen</button>
            </form>
          </article>
        )}

        {canWrite && meetingEditable && (
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Sitzung</span><h2>Details bearbeiten</h2></div>
            </div>
            <form action={updateMeetingDetailsAction} className="form-stack">
              <input type="hidden" name="meetingId" value={id} />
              <label>Titel<input name="title" defaultValue={String(meeting.title)} required /></label>
              <label>Start<input name="startsAt" type="datetime-local" defaultValue={dateTimeLocal(meeting.starts_at)} required /></label>
              <label>Ort<input name="location" defaultValue={meeting.location ? String(meeting.location) : ""} /></label>
              <label>Vorbereitung / Notiz<textarea name="notes" rows={3} defaultValue={meeting.notes ? String(meeting.notes) : ""} /></label>
              <button className="mini-button">Sitzungsdaten speichern</button>
            </form>
          </article>
        )}

        {meeting.notes && !meetingEditable && (
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Vorbereitung</span><h2>Sitzungsnotiz</h2></div>
            </div>
            <p>{String(meeting.notes)}</p>
          </article>
        )}

        {canWrite && ["planned","cancelled"].includes(String(meeting.status)) && (
          <article className="panel meeting-danger-panel">
            <div className="panel-head">
              <div><span className="eyebrow">Verwaltung</span><h2>Sitzung entfernen</h2></div>
            </div>
            <p>Nur geplante oder abgesagte Sitzungen ohne Beschlüsse und Dokumente können in den Papierkorb verschoben werden.</p>
            <form action={moveToTrashAction}>
              <input type="hidden" name="type" value="meeting" />
              <input type="hidden" name="id" value={id} />
              <ConfirmSubmitButton
                message={"Sitzung „"+String(meeting.title)+"“ in den Papierkorb verschieben?"}
              >
                Sitzung löschen
              </ConfirmSubmitButton>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
