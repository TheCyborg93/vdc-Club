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
  updateMeetingStatusAction,
} from "@/app/sitzungen/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { meetingStatusLabel } from "@/lib/ui-labels";

const attendanceLabels: Record<string, string> = {
  invited: "Eingeladen",
  present: "Anwesend",
  absent: "Abwesend",
  excused: "Entschuldigt",
};

const agendaLabels: Record<string, string> = {
  open: "Offen",
  active: "Aktiv",
  done: "Erledigt",
  deferred: "Vertagt",
};

const errors: Record<string, string> = {
  missing: "Bitte alle erforderlichen Angaben ausfüllen.",
  attendee: "Teilnehmer konnte nicht hinzugefügt werden.",
  resolution: "Für einen Beschluss werden Titel und Beschlusstext benötigt.",
  protected_delete: "Diese Sitzung kann nicht gelöscht werden, weil sie bereits abgeschlossen ist oder Beschlüsse/Dokumente enthält.",
  agenda_delete: "Dieser TOP kann nicht gelöscht werden, weil bereits ein Beschluss dazu existiert oder die Sitzung abgeschlossen ist.",
  meeting_locked: "Diese Änderung ist im aktuellen Sitzungsstatus nicht möglich.",
  open_agenda: "Die Sitzung kann noch nicht beendet werden. Offene oder aktive TOPs müssen zuerst erledigt oder vertagt werden.",
  attendance_open: "Die Sitzung kann noch nicht beendet werden. Bei allen eingeladenen Personen muss die Anwesenheit geklärt sein.",
  invalid_transition: "Dieser Statuswechsel ist nicht zulässig.",
};

export const dynamic = "force-dynamic";

function formatDateTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function dateTimeLocal(value: unknown) {
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
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    agenda?: string;
    resolution?: string;
    created?: string;
    agenda_deleted?: string;
    notes?: string;
    saved?: string;
    status?: string;
  }>;
}) {
  const actor = await requirePermission("meetings.read");
  const sql = getDb();
  if (!sql) notFound();

  const { id } = await params;
  const query = await searchParams;

  const [meetingRows, agenda, attendees, members] = await Promise.all([
    sql`
      SELECT
        m.id::text,
        m.title,
        m.starts_at,
        m.location,
        m.status,
        m.notes,
        m.ended_at,
        e.id::text AS event_id
      FROM meetings m
      LEFT JOIN club_events e ON e.id = m.event_id
      WHERE m.id = ${id}::uuid
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
      LEFT JOIN resolutions r ON r.agenda_item_id = ai.id
      LEFT JOIN tasks t ON t.source_type = 'resolution' AND t.source_id = r.id AND t.deleted_at IS NULL
      WHERE ai.meeting_id = ${id}::uuid
      ORDER BY ai.position
    `,
    sql`
      SELECT
        ma.member_id::text,
        ma.attendance,
        m.first_name,
        m.last_name
      FROM meeting_attendees ma
      JOIN members m ON m.id = ma.member_id
      WHERE ma.meeting_id = ${id}::uuid
      ORDER BY m.last_name, m.first_name
    `,
    sql`
      SELECT id::text, first_name, last_name
      FROM members
      WHERE status = 'active'
      ORDER BY last_name, first_name
    `,
  ]);

  const meeting = meetingRows[0];
  if (!meeting) notFound();

  const canWrite = hasPermission(actor.roles, "meetings.write");
  const canResolve = hasPermission(actor.roles, "resolutions.write");
  const canCreateTasks = hasPermission(actor.roles, "tasks.write");
  const invitedIds = new Set(attendees.map((row) => String(row.member_id)));
  const availableMembers = members.filter((row) => !invitedIds.has(String(row.id)));
  const presentCount = attendees.filter((row) => row.attendance === "present").length;
  const unresolvedAttendanceCount = attendees.filter((row) => row.attendance === "invited").length;
  const openAgendaCount = agenda.filter((row) => ["open", "active"].includes(String(row.status))).length;
  const meetingEditable = ["planned","cancelled"].includes(String(meeting.status));
  const meetingRunning = meeting.status === "running";

  return (
    <div className="page-stack">
      <section className="meeting-hero">
        <div>
          <Link href="/sitzungen" className="back-link">← Sitzungen</Link>
          <span className="eyebrow">Sitzungsmodus</span>
          <h1>{String(meeting.title)}</h1>
          <p>{formatDateTime(meeting.starts_at)} · {meeting.location ? String(meeting.location) : "Ort offen"}</p>
        </div>
        <div className="meeting-hero-side">
          <div className="meeting-hero-links">
            <Link href={`/sitzungen/${id}/protokoll`} className="ghost-button">Protokoll</Link>
            <b className={`status-badge status-${meeting.status}`}>{meetingStatusLabel(meeting.status)}</b>
          </div>
          {canWrite && (
            <div className="meeting-status-actions">
              {meeting.status === "planned" && (
                <>
                  <form action={updateMeetingStatusAction}>
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="status" value="running" />
                    <button className="primary-button">Sitzung starten</button>
                  </form>
                  <form action={updateMeetingStatusAction}>
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <button className="mini-button">Absagen</button>
                  </form>
                </>
              )}

              {meeting.status === "cancelled" && (
                <form action={updateMeetingStatusAction}>
                  <input type="hidden" name="meetingId" value={id} />
                  <input type="hidden" name="status" value="planned" />
                  <button className="primary-button">Wieder planen</button>
                </form>
              )}

              {meeting.status === "running" && (
                <>
                  <form action={updateMeetingStatusAction}>
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="status" value="completed" />
                    <button
                      className="light-button"
                      disabled={openAgendaCount>0 || unresolvedAttendanceCount>0}
                      title={
                        openAgendaCount>0
                          ? "Offene TOPs zuerst abschließen."
                          : unresolvedAttendanceCount>0
                            ? "Anwesenheit aller eingeladenen Personen klären."
                            : undefined
                      }
                    >
                      Sitzung beenden
                    </button>
                  </form>
                  {(openAgendaCount>0 || unresolvedAttendanceCount>0) && (
                    <span className="meeting-close-hint">
                      {openAgendaCount>0 ? openAgendaCount+" TOP(s) offen" : ""}
                      {openAgendaCount>0 && unresolvedAttendanceCount>0 ? " · " : ""}
                      {unresolvedAttendanceCount>0 ? unresolvedAttendanceCount+" Anwesenheit(en) ungeklärt" : ""}
                    </span>
                  )}
                </>
              )}

              {meeting.status === "completed" && (
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

              {["planned","cancelled"].includes(String(meeting.status)) && (
                <form action={moveToTrashAction}>
                  <input type="hidden" name="type" value="meeting" />
                  <input type="hidden" name="id" value={id} />
                  <ConfirmSubmitButton
                    message={"Sitzung „"+String(meeting.title)+"“ in den Papierkorb verschieben? Bereits verknüpfte Beschlüsse oder Dokumente verhindern das Löschen."}
                  >
                    Löschen
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          )}
        </div>
      </section>

      {query.error && <div className="form-error">{errors[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(query.agenda || query.resolution || query.created || query.saved || query.status) && <div className="form-success">Sitzung wurde aktualisiert.</div>}
      {query.notes && <div className="form-success">Ergebnisnotiz wurde gespeichert.</div>}
      {query.agenda_deleted && <div className="form-success">TOP wurde gelöscht.</div>}

      <section className="meeting-summary-grid">
        <article><span>TOPs</span><strong>{agenda.length}</strong><small>{openAgendaCount} offen</small></article>
        <article><span>Teilnehmer</span><strong>{attendees.length}</strong><small>{presentCount} anwesend{unresolvedAttendanceCount ? " · "+unresolvedAttendanceCount+" offen" : ""}</small></article>
        <article><span>Beschlüsse</span><strong>{agenda.filter((row) => row.resolution_id).length}</strong><small>in dieser Sitzung</small></article>
        <article><span>Status</span><strong>{meetingStatusLabel(meeting.status)}</strong><small>{meeting.ended_at ? `beendet ${formatDateTime(meeting.ended_at)}` : "laufend / geplant"}</small></article>
      </section>

      <section className="meeting-workspace">
        <div className="meeting-agenda-column">
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Tagesordnung</span><h2>TOPs</h2></div>
              <span className="count-chip">{agenda.length}</span>
            </div>

            <div className="agenda-list">
              {agenda.length === 0 ? (
                <div className="empty-state">Noch keine Tagesordnungspunkte vorhanden.</div>
              ) : agenda.map((item) => (
                <article className={`agenda-card agenda-${item.status}`} key={String(item.id)}>
                  <div className="agenda-number">{String(item.position).padStart(2, "0")}</div>
                  <div className="agenda-content">
                    <div className="agenda-title-row">
                      <div>
                        <strong>{String(item.title)}</strong>
                        <span>{agendaLabels[String(item.status)] ?? String(item.status)}</span>
                      </div>
                      {item.resolution_number && <b className="resolution-number">{String(item.resolution_number)}</b>}
                    </div>
                    {item.description && <p>{String(item.description)}</p>}

                    {meetingRunning && canWrite ? (
                      <form action={updateAgendaNotesAction} className="agenda-result-form">
                        <input type="hidden" name="meetingId" value={id} />
                        <input type="hidden" name="agendaItemId" value={String(item.id)} />
                        <label>
                          Ergebnisnotiz
                          <textarea
                            name="notes"
                            rows={2}
                            defaultValue={item.notes ? String(item.notes) : ""}
                            placeholder="Diskussion, Ergebnis oder wichtige Hinweise zum TOP …"
                          />
                        </label>
                        <button className="mini-button">Notiz speichern</button>
                      </form>
                    ) : item.notes ? (
                      <div className="agenda-result-note">
                        <span>Ergebnisnotiz</span>
                        <p>{String(item.notes)}</p>
                      </div>
                    ) : null}

                    {item.resolution_id ? (
                      <div className="resolution-inline">
                        <span className="eyebrow">Beschluss</span>
                        <strong>{String(item.resolution_title)}</strong>
                        <p>{String(item.decision_text)}</p>
                        <div className="vote-summary">
                          <span>Ja {Number(item.votes_yes)}</span>
                          <span>Nein {Number(item.votes_no)}</span>
                          <span>Enthaltung {Number(item.votes_abstain)}</span>
                          {item.task_id && <span>Aufgabe: {String(item.task_status)}</span>}
                        </div>
                      </div>
                    ) : (
                      <>
                        {canWrite && meetingRunning && (
                          <div className="agenda-actions">
                            {item.status !== "active" && (
                              <form action={updateAgendaStatusAction}>
                                <input type="hidden" name="meetingId" value={id} />
                                <input type="hidden" name="agendaItemId" value={String(item.id)} />
                                <input type="hidden" name="status" value="active" />
                                <button className="mini-button">Jetzt behandeln</button>
                              </form>
                            )}
                            {item.status !== "deferred" && (
                              <form action={updateAgendaStatusAction}>
                                <input type="hidden" name="meetingId" value={id} />
                                <input type="hidden" name="agendaItemId" value={String(item.id)} />
                                <input type="hidden" name="status" value="deferred" />
                                <button className="mini-button">Vertagen</button>
                              </form>
                            )}
                            {item.status !== "done" && (
                              <form action={updateAgendaStatusAction}>
                                <input type="hidden" name="meetingId" value={id} />
                                <input type="hidden" name="agendaItemId" value={String(item.id)} />
                                <input type="hidden" name="status" value="done" />
                                <button className="mini-button">Ohne Beschluss erledigen</button>
                              </form>
                            )}
                            {["planned","running"].includes(String(meeting.status)) && (
                              <form action={deleteAgendaItemAction}>
                                <input type="hidden" name="meetingId" value={id} />
                                <input type="hidden" name="agendaItemId" value={String(item.id)} />
                                <ConfirmSubmitButton message={"TOP „"+String(item.title)+"“ wirklich löschen?"}>
                                  TOP löschen
                                </ConfirmSubmitButton>
                              </form>
                            )}
                          </div>
                        )}

                        {canResolve && meetingRunning && (
                          <details className="resolution-form-wrap">
                            <summary>Beschluss zu diesem TOP erfassen</summary>
                            <form action={createResolutionFromAgendaAction} className="form-stack">
                              <input type="hidden" name="meetingId" value={id} />
                              <input type="hidden" name="agendaItemId" value={String(item.id)} />
                              <label>Titel<input name="title" defaultValue={String(item.title)} required /></label>
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
                                        {members.map((member) => (
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
                          </details>
                        )}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </article>

          {canWrite && ["planned","running"].includes(String(meeting.status)) && (
            <article className="panel">
              <div className="panel-head"><div><span className="eyebrow">Vorbereitung</span><h2>TOP hinzufügen</h2></div></div>
              <form action={addAgendaItemAction} className="form-stack">
                <input type="hidden" name="meetingId" value={id} />
                <label>Titel<input name="title" required /></label>
                <label>Beschreibung<textarea name="description" rows={3} /></label>
                <button className="primary-button" type="submit">TOP hinzufügen</button>
              </form>
            </article>
          )}
        </div>

        <aside className="meeting-side-column">
          <article className="panel sticky-panel">
            <div className="panel-head"><div><span className="eyebrow">Teilnehmer</span><h2>Anwesenheit</h2></div></div>
            <div className="attendee-list">
              {attendees.length === 0 ? (
                <div className="empty-state">Noch niemand eingeladen.</div>
              ) : attendees.map((attendee) => (
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

            {canWrite && ["planned","running"].includes(String(meeting.status)) && availableMembers.length > 0 && (
              <form action={addAttendeeAction} className="form-stack attendee-add-form">
                <input type="hidden" name="meetingId" value={id} />
                <label>Teilnehmer hinzufügen
                  <select name="memberId" defaultValue="" required>
                    <option value="" disabled>Mitglied auswählen</option>
                    {availableMembers.map((member) => (
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

          {canWrite && meetingEditable && (
            <article className="panel">
              <div className="panel-head"><div><span className="eyebrow">Sitzung</span><h2>Details bearbeiten</h2></div></div>
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
              <div className="panel-head"><div><span className="eyebrow">Vorbereitung</span><h2>Notiz</h2></div></div>
              <p>{String(meeting.notes)}</p>
            </article>
          )}
        </aside>
      </section>
    </div>
  );
}
