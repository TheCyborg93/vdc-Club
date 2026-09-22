import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  addAgendaItemAction,
  addAttendeeAction,
  addMeetingGuestAction,
  addVoteExclusionAction,
  removeAttendeeAction,
  carryForwardAgendaItemAction,
  carryForwardTaskAction,
  createResolutionFromAgendaAction,
  deleteAgendaItemAction,
  deleteMeetingGuestAction,
  deleteVoteExclusionAction,
  updateAgendaFormalAction,
  updateAgendaStatusAction,
  updateAttendanceAction,
  updateMeetingDetailsAction,
  updateMeetingFormalitiesAction,
  updateMeetingGuestAttendanceAction,
  updateMeetingOfficersAction,
  updateMeetingStatusAction,
} from "@/app/sitzungen/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { MeetingAutoNotes } from "@/components/meeting-auto-notes";
import { MeetingStartPanel } from "@/components/meeting-start-panel";
import { MeetingLiveOptions } from "@/components/meeting-live-options";
import {
  removeMeetingAttachmentAction,
  uploadMeetingAttachmentAction,
} from "@/app/sitzungen/attachment-actions";
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

const meetingModeLabels:Record<string,string>={
  in_person:"Präsenz",
  hybrid:"Hybrid",
  online:"Online",
};

const voteMethodLabels:Record<string,string>={
  open:"Offen",
  show_of_hands:"Handzeichen",
  roll_call:"Namentlich",
  secret:"Geheim",
  electronic:"Elektronisch",
};

const outcomeLabels:Record<string,string>={
  accepted:"Angenommen",
  rejected:"Abgelehnt",
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
  attendee_remove_locked:"Teilnehmer können nur vor Sitzungsbeginn wieder entfernt werden.",
  resolution:"Für einen Beschluss werden Titel und Beschlusstext benötigt.",
  protected_delete:"Diese Sitzung kann nicht gelöscht werden, weil sie bereits abgeschlossen ist oder Beschlüsse/Dokumente enthält.",
  agenda_delete:"Dieser TOP kann nicht gelöscht werden, weil bereits ein Beschluss dazu existiert oder die Sitzung abgeschlossen ist.",
  meeting_locked:"Diese Änderung ist im aktuellen Sitzungsstatus nicht möglich.",
  open_agenda:"Die Sitzung kann noch nicht beendet werden. Offene oder aktive TOPs müssen zuerst erledigt oder vertagt werden.",
  attendance_open:"Die Sitzung kann noch nicht beendet werden. Bei allen eingeladenen Personen muss die Anwesenheit geklärt sein.",
  guest_attendance_open:"Die Sitzung kann noch nicht beendet werden. Bei allen eingeladenen Gästen muss die Anwesenheit geklärt sein.",
  invalid_transition:"Dieser Statuswechsel ist nicht zulässig.",
  minutes_archived:"Die Sitzung kann nicht wieder geöffnet werden, weil das Protokoll bereits archiviert ist.",
  forbidden:"Diese Aktion ist für deine Rolle nicht freigegeben.",
  officers_missing:"Sitzungsleitung und Protokollführung müssen festgelegt sein.",
  formalities_open:"Einladung, Tagesordnung und Beschlussfähigkeit müssen vollständig dokumentiert sein.",
  not_quorate_for_resolutions:"Beschlüsse können nur bei dokumentierter Beschlussfähigkeit abgeschlossen werden.",
  vote_incomplete:"Mindestens eine Abstimmung ist formal unvollständig oder die Stimmenzahl passt nicht.",
  vote_mismatch:"Ja, Nein und Enthaltungen müssen zusammen genau der Zahl der Stimmberechtigten entsprechen.",
  roll_call_details:"Bei einer namentlichen Abstimmung müssen Namen und jeweilige Stimmen dokumentiert werden.",
  spontaneous_basis:"Bei einem nicht mit der Einladung angekündigten TOP ist vor einem Beschluss eine Begründung erforderlich.",
  guest_missing:"Bitte einen Namen für den Gast angeben.",
  exclusion_missing:"Für einen Stimmrechtsausschluss werden Person und Begründung benötigt.",
  carryover_exists:"Dieser offene Punkt wurde bereits in die Tagesordnung übernommen.",
  attachment_missing:"Bitte eine Datei auswählen.",
  attachment_size:"Die Anlage ist zu groß. Maximal 8 MB.",
  attachment_type:"Dieser Dateityp ist für Sitzungsanlagen nicht erlaubt.",
  attachment_upload:"Die Anlage konnte nicht hochgeladen werden.",
  storage:"Der private Dokumentenspeicher ist nicht konfiguriert.",
  start_quorum:"Bitte die Beschlussfähigkeit vor dem Start bestätigen.",
  start_preparation:"Die Vorbereitung ist noch nicht vollständig.",
  start_attendees:"Vor dem Start muss mindestens ein Vorstandsmitglied eingeladen sein.",
  start_agenda:"Vor dem Start muss mindestens ein Tagesordnungspunkt vorhanden sein.",
  start_attendance:"Bitte die Anwesenheit aller eingeladenen Mitglieder festlegen.",
  start_guest_attendance:"Bitte die Anwesenheit aller eingeladenen Gäste festlegen.",
  start_officers_present:"Sitzungsleitung und Protokollführung müssen zum Sitzungsbeginn als anwesend markiert sein.",
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
    formalities?:string;
    guest?:string;
    exclusion?:string;
    formal?:string;
    attachment?:string;
    attachment_deleted?:string;
    attendee_removed?:string;
    started?:string;
  }>;
}) {
  const actor=await requirePermission("meetings.read");
  const sql=getDb();
  if (!sql) notFound();

  const {id}=await params;
  const query=await searchParams;

  const [
    meetingRows,
    agenda,
    attendees,
    members,
    guests,
    exclusions,
    attachments,
    carryovers,
  ]=await Promise.all([
    sql`
      SELECT
        m.id::text,
        m.title,
        m.starts_at,
        m.location,
        m.status,
        m.notes,
        m.opened_at,
        m.ended_at,
        m.chair_member_id::text,
        m.minute_taker_member_id::text,
        m.minutes_status,
        m.meeting_mode,
        m.invited_at,
        m.invitation_method,
        m.invitation_timely,
        m.agenda_sent_with_invitation,
        m.quorum_confirmed,
        m.quorum_note,
        m.quorum_basis,
        m.formalities_note,
        m.next_meeting_at,
        m.minutes_closing,
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
        ai.announced_with_invitation,
        ai.decision_basis_note,
        ai.carried_from_agenda_item_id::text,
        ai.carried_from_task_id::text,
        r.id::text AS resolution_id,
        r.resolution_number,
        r.title AS resolution_title,
        r.decision_text,
        r.votes_yes,
        r.votes_no,
        r.votes_abstain,
        r.vote_method,
        r.vote_details,
        r.eligible_voters,
        r.excluded_voters,
        r.decision_outcome,
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
        ma.voting_eligible,
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
    sql`
      SELECT id::text,name,organization,note,attendance
      FROM meeting_guests
      WHERE meeting_id=${id}::uuid
      ORDER BY created_at,name
    `,
    sql`
      SELECT
        ave.id::text,
        ave.agenda_item_id::text,
        ave.member_id::text,
        ave.reason,
        COALESCE(m.first_name || ' ' || m.last_name,ave.person_name) AS person_name
      FROM agenda_vote_exclusions ave
      LEFT JOIN members m ON m.id=ave.member_id
      JOIN agenda_items ai ON ai.id=ave.agenda_item_id
      WHERE ai.meeting_id=${id}::uuid
      ORDER BY ave.created_at
    `,
    sql`
      SELECT
        d.id::text,
        d.agenda_item_id::text,
        d.title,
        d.original_filename,
        d.file_size_bytes,
        d.storage_type,
        d.storage_ref
      FROM documents d
      WHERE d.meeting_id=${id}::uuid
        AND d.agenda_item_id IS NOT NULL
        AND d.category='Sitzungsanlage'
        AND d.deleted_at IS NULL
      ORDER BY d.created_at
    `,
    sql`
      WITH current_meeting AS (
        SELECT starts_at
        FROM meetings
        WHERE id=${id}::uuid
        LIMIT 1
      ),
      previous_meeting AS (
        SELECT m.id,m.title
        FROM meetings m,current_meeting c
        WHERE m.id<>${id}::uuid
          AND m.deleted_at IS NULL
          AND m.status='completed'
          AND m.starts_at<c.starts_at
        ORDER BY m.starts_at DESC
        LIMIT 1
      )
      SELECT
        'agenda'::text AS source_type,
        ai.id::text AS source_id,
        ai.title,
        COALESCE(ai.notes,ai.description) AS detail,
        NULL::text AS owner_name,
        NULL::text AS due_date,
        pm.title AS meeting_title
      FROM previous_meeting pm
      JOIN agenda_items ai ON ai.meeting_id=pm.id
      WHERE ai.status='deferred'
        AND NOT EXISTS (
          SELECT 1 FROM agenda_items current
          WHERE current.meeting_id=${id}::uuid
            AND current.carried_from_agenda_item_id=ai.id
        )

      UNION ALL

      SELECT
        'task'::text,
        t.id::text,
        t.title,
        t.description,
        CASE WHEN owner.id IS NOT NULL THEN owner.first_name || ' ' || owner.last_name ELSE NULL END,
        t.due_date::text,
        pm.title
      FROM previous_meeting pm
      JOIN resolutions r ON r.meeting_id=pm.id
      JOIN tasks t
        ON t.source_type='resolution'
       AND t.source_id=r.id
       AND t.deleted_at IS NULL
       AND t.status IN ('open','in_progress','blocked')
      LEFT JOIN members owner ON owner.id=t.owner_member_id
      WHERE NOT EXISTS (
        SELECT 1 FROM agenda_items current
        WHERE current.meeting_id=${id}::uuid
          AND current.carried_from_task_id=t.id
      )
      ORDER BY source_type,title
    `,
  ]);



  const meeting=meetingRows[0];
  if (!meeting) notFound();

  const canWrite=hasPermission(actor.roles,"meetings.write");
  const canResolve=hasPermission(actor.roles,"resolutions.write");
  const canCreateTasks=hasPermission(actor.roles,"tasks.write");
  const canDocumentsWrite=hasPermission(actor.roles,"documents.write");
  const minutesStatus=String(meeting.minutes_status ?? "draft");

  const invitedIds=new Set(attendees.map((row)=>String(row.member_id)));
  const availableMembers=members.filter((row)=>!invitedIds.has(String(row.id)));
  const presentCount=attendees.filter((row)=>row.attendance==="present").length;
  const presentVoterCount=attendees.filter(
    (row)=>row.attendance==="present" && row.voting_eligible===true,
  ).length;
  const unresolvedAttendanceCount=attendees.filter((row)=>row.attendance==="invited").length;
  const unresolvedGuestAttendanceCount=guests.filter((row)=>row.attendance==="invited").length;
  const openAgendaCount=agenda.filter((row)=>["open","active"].includes(String(row.status))).length;
  const incompleteVoteCount=agenda.filter((row)=>{
    if (!row.resolution_id) return false;
    const eligible=row.eligible_voters==null ? null : Number(row.eligible_voters);
    const total=Number(row.votes_yes ?? 0)+Number(row.votes_no ?? 0)+Number(row.votes_abstain ?? 0);
    return !row.vote_method ||
      !row.decision_outcome ||
      eligible==null ||
      eligible!==total ||
      (row.vote_method==="roll_call" && !String(row.vote_details ?? "").trim());
  }).length;
  const spontaneousBasisMissing=agenda.filter(
    (row)=>row.resolution_id && row.announced_with_invitation===false && !String(row.decision_basis_note ?? "").trim(),
  ).length;
  const officersComplete=Boolean(meeting.chair_member_id && meeting.minute_taker_member_id);
  const invitationPrepared=
    Boolean(meeting.invited_at) &&
    Boolean(String(meeting.invitation_method ?? "").trim()) &&
    meeting.invitation_timely!=null &&
    meeting.agenda_sent_with_invitation!=null;
  const formalitiesDocumented=invitationPrepared && meeting.quorum_confirmed!=null;
  const preparationChecks=[
    officersComplete,
    Boolean(meeting.invited_at),
    Boolean(String(meeting.invitation_method ?? "").trim()),
    meeting.invitation_timely!=null,
    meeting.agenda_sent_with_invitation!=null,
    attendees.length>0,
    agenda.length>0,
  ];
  const preparationCheckCount=preparationChecks.filter(Boolean).length;
  const preparationReady=preparationCheckCount===preparationChecks.length;
  const preparationMissing=[
    !officersComplete ? "Sitzungsleitung und Protokollführung festlegen" : null,
    !meeting.invited_at ? "Einladungsdatum eintragen" : null,
    !String(meeting.invitation_method ?? "").trim() ? "Einladungsweg eintragen" : null,
    meeting.invitation_timely==null ? "Fristgerechte Einladung prüfen" : null,
    meeting.agenda_sent_with_invitation==null ? "Tagesordnung zur Einladung prüfen" : null,
    attendees.length===0 ? "Vorstandsmitglieder einladen" : null,
    agenda.length===0 ? "Mindestens einen TOP anlegen" : null,
  ].filter((item):item is string=>Boolean(item));
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
  const preferredExclusions=preferredAgenda
    ? exclusions.filter((row)=>String(row.agenda_item_id)===String(preferredAgenda.id))
    : [];
  const preferredAttachments=preferredAgenda
    ? attachments.filter((row)=>String(row.agenda_item_id)===String(preferredAgenda.id))
    : [];
  const eligibleForCurrentVote=Math.max(0,presentVoterCount-preferredExclusions.length);
  const completionReady=
    officersComplete &&
    formalitiesDocumented &&
    (agenda.filter((row)=>row.resolution_id).length===0 || meeting.quorum_confirmed===true) &&
    openAgendaCount===0 &&
    unresolvedAttendanceCount===0 &&
    unresolvedGuestAttendanceCount===0 &&
    incompleteVoteCount===0 &&
    spontaneousBasisMissing===0;
  const workflowPhase=
    meeting.status==="planned" || meeting.status==="cancelled"
      ? 1
      : meeting.status==="running"
        ? 2
        : 3;
  const firstOpenAgenda=agenda.find((row)=>["open","active"].includes(String(row.status))) ?? null;

  return (
    <div className={`page-stack meeting-control-page meeting-phase-${workflowPhase}`}>
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
          <b className={`status-badge status-${meeting.status}`}>{meetingStatusLabel(meeting.status)}</b>

          {canWrite && meeting.status==="planned" && (
            <a href="#sitzung-starten" className="primary-button">Sitzung starten</a>
          )}

          {canWrite && meeting.status==="running" && (
            <a href="#abschluss" className="primary-button">Sitzung beenden</a>
          )}

          {canWrite && meeting.status==="cancelled" && (
            <form action={updateMeetingStatusAction}>
              <input type="hidden" name="meetingId" value={id} />
              <input type="hidden" name="status" value="planned" />
              <button className="primary-button">Wieder planen</button>
            </form>
          )}

          {meeting.status==="completed" && (
            <Link href={`/sitzungen/${id}/protokoll`} className="primary-button">Protokoll öffnen</Link>
          )}

          {canWrite && meeting.status==="completed" && minutesStatus!=="archived" && (
            <details className="meeting-hero-more">
              <summary className="mini-button">•••</summary>
              <div>
                <form action={updateMeetingStatusAction}>
                  <input type="hidden" name="meetingId" value={id} />
                  <input type="hidden" name="status" value="running" />
                  <ConfirmSubmitButton
                    message="Sitzung wieder öffnen? Das Ende wird zurückgesetzt und das Protokoll muss erneut geprüft werden."
                    className="mini-button"
                  >
                    Sitzung wieder öffnen
                  </ConfirmSubmitButton>
                </form>
              </div>
            </details>
          )}
        </div>
      </section>

      <nav className="meeting-workflow-bar meeting-workflow-three" aria-label="Sitzungsablauf">
        <a href="#vorbereitung" className={workflowPhase===1 ? "is-current" : workflowPhase>1 ? "is-done" : ""}>
          <b>1</b>
          <span><strong>Vorbereitung</strong><small>Daten, Einladung, Personen, TOPs</small></span>
        </a>
        <a
          href={meeting.status==="planned" ? "#sitzung-starten" : "#live"}
          className={workflowPhase===2 ? "is-current" : workflowPhase>2 ? "is-done" : ""}
        >
          <b>2</b>
          <span><strong>Sitzung</strong><small>Anwesenheit, TOPs & Beschlüsse</small></span>
        </a>
        <Link href={`/sitzungen/${id}/protokoll`} className={workflowPhase===3 ? "is-current" : ""}>
          <b>3</b>
          <span><strong>Protokoll</strong><small>Prüfen, freigeben, archivieren</small></span>
        </Link>
      </nav>

      {query.error && <div className="form-error">{errors[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(query.agenda || query.resolution || query.created || query.saved || query.status || query.officers || query.formalities || query.guest || query.exclusion || query.formal || query.attachment || query.attachment_deleted || query.attendee_removed || query.started) && <div className="form-success">Sitzung wurde aktualisiert.</div>}
      {query.notes && <div className="form-success">Ergebnisnotiz wurde gespeichert.</div>}
      {query.agenda_deleted && <div className="form-success">TOP wurde gelöscht.</div>}

      <section className="meeting-control-stats">
        {workflowPhase===1 ? (
          <>
            <article className={preparationReady ? "is-ready" : "needs-attention"}>
              <span>Vorbereitung</span>
              <strong>{preparationCheckCount}/7</strong>
              <small>{preparationReady ? "bereit zum Start" : "noch ergänzen"}</small>
            </article>
            <article className={attendees.length>0 ? "is-ready" : ""}>
              <span>Eingeladen</span>
              <strong>{attendees.length}</strong>
              <small>{attendees.filter((row)=>row.voting_eligible===true).length} stimmberechtigt</small>
            </article>
            <article className={agenda.length>0 ? "is-ready" : ""}>
              <span>Tagesordnung</span>
              <strong>{agenda.length}</strong>
              <small>{carryovers.length} offene Punkte verfügbar</small>
            </article>
            <article>
              <span>Gäste</span>
              <strong>{guests.length}</strong>
              <small>optional</small>
            </article>
          </>
        ) : workflowPhase===2 ? (
          <>
            <article className={meeting.quorum_confirmed===true ? "is-ready" : "needs-attention"}>
              <span>Beschlussfähig</span>
              <strong>{meeting.quorum_confirmed===true ? "Ja" : "Nein"}</strong>
              <small>Sitzungsbeginn dokumentiert</small>
            </article>
            <article>
              <span>Anwesend</span>
              <strong>{presentCount}/{attendees.length}</strong>
              <small>{presentVoterCount} stimmberechtigt</small>
            </article>
            <article className={openAgendaCount===0 ? "is-ready" : ""}>
              <span>TOPs</span>
              <strong>{openAgendaCount}</strong>
              <small>noch offen</small>
            </article>
            <article>
              <span>Beschlüsse</span>
              <strong>{agenda.filter((row)=>row.resolution_id).length}</strong>
              <small>{attachments.length} Anlagen</small>
            </article>
          </>
        ) : (
          <>
            <article className="is-ready"><span>Sitzung</span><strong>Beendet</strong><small>{formatDateTime(meeting.ended_at)}</small></article>
            <article><span>TOPs</span><strong>{agenda.length}</strong><small>{agenda.filter((row)=>row.status==="deferred").length} vertagt</small></article>
            <article><span>Beschlüsse</span><strong>{agenda.filter((row)=>row.resolution_id).length}</strong><small>{attachments.length} Anlagen</small></article>
            <article><span>Protokoll</span><strong>{minutesStatusLabels[minutesStatus] ?? minutesStatus}</strong><small>nächster Arbeitsschritt</small></article>
          </>
        )}
      </section>

      {["planned","cancelled"].includes(String(meeting.status)) && (
        <section className="meeting-formalities-panel" id="vorbereitung">
          <article className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Vorbereitung</span>
                <h2>Einladung & Rahmen</h2>
              </div>
              <span className={invitationPrepared ? "formal-state formal-ok" : "formal-state formal-open"}>
                {invitationPrepared ? "Vollständig" : "Noch offen"}
              </span>
            </div>

            {canWrite && meeting.status==="planned" ? (
              <form action={updateMeetingFormalitiesAction} className="meeting-formalities-form">
                <input type="hidden" name="meetingId" value={id} />

                <div className="form-grid">
                  <label>
                    Sitzungsart
                    <select name="meetingMode" defaultValue={String(meeting.meeting_mode ?? "in_person")}>
                      <option value="in_person">Präsenz</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="online">Online</option>
                    </select>
                  </label>
                  <label>
                    Einladung versendet am
                    <input name="invitedAt" type="datetime-local" defaultValue={dateTimeLocal(meeting.invited_at)} required />
                  </label>
                </div>

                <div className="form-grid">
                  <label>
                    Einladung über
                    <input
                      name="invitationMethod"
                      defaultValue={meeting.invitation_method ? String(meeting.invitation_method) : ""}
                      placeholder="z. B. WhatsApp, E-Mail, schriftlich"
                      required
                    />
                  </label>
                  <label>
                    Einladung fristgerecht?
                    <select
                      name="invitationTimely"
                      defaultValue={meeting.invitation_timely==null ? "" : meeting.invitation_timely ? "yes" : "no"}
                      required
                    >
                      <option value="" disabled>Bitte auswählen</option>
                      <option value="yes">Ja</option>
                      <option value="no">Nein / Abweichung</option>
                    </select>
                  </label>
                </div>

                <label>
                  Tagesordnung mit Einladung versendet?
                  <select
                    name="agendaSentWithInvitation"
                    defaultValue={meeting.agenda_sent_with_invitation==null ? "" : meeting.agenda_sent_with_invitation ? "yes" : "no"}
                    required
                  >
                    <option value="" disabled>Bitte auswählen</option>
                    <option value="yes">Ja</option>
                    <option value="no">Nein / abweichend</option>
                  </select>
                </label>

                <label>
                  Besonderheiten zur Einladung
                  <textarea
                    name="formalitiesNote"
                    rows={2}
                    defaultValue={meeting.formalities_note ? String(meeting.formalities_note) : ""}
                    placeholder="Nur bei Abweichungen oder Besonderheiten nötig"
                  />
                </label>

                <button className="mini-button" type="submit">Vorbereitung speichern</button>
              </form>
            ) : (
              <div className="meeting-formal-readonly">
                <span>{meetingModeLabels[String(meeting.meeting_mode)] ?? String(meeting.meeting_mode)}</span>
                <span>Einladung: {meeting.invitation_timely===true ? "fristgerecht" : meeting.invitation_timely===false ? "Abweichung" : "nicht geprüft"}</span>
                <span>Tagesordnung: {meeting.agenda_sent_with_invitation===true ? "mit Einladung" : meeting.agenda_sent_with_invitation===false ? "abweichend" : "nicht geprüft"}</span>
              </div>
            )}
          </article>
        </section>
      )}

      {["planned","cancelled"].includes(String(meeting.status)) && (
        <section className="meeting-secretary-setup">
          <article className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Verantwortung</span>
                <h2>Sitzungsleitung & Protokollführung</h2>
              </div>
              <span className={officersComplete ? "formal-state formal-ok" : "formal-state formal-open"}>
                {officersComplete ? "Festgelegt" : "Noch offen"}
              </span>
            </div>

            {canWrite && meeting.status==="planned" ? (
              <form action={updateMeetingOfficersAction} className="meeting-officer-form">
                <input type="hidden" name="meetingId" value={id} />
                <label>
                  Sitzungsleitung
                  <select name="chairMemberId" defaultValue={String(meeting.chair_member_id ?? "")} required>
                    <option value="">Bitte auswählen</option>
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
                    required
                  >
                    <option value="">Bitte auswählen</option>
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
                <span>Rollen sind für die Sitzung festgelegt.</span>
              </div>
            )}
          </article>
        </section>
      )}

      {meetingRunning && (
        <section className="meeting-session-shell" id="live">
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
                      key={String(preferredAgenda.id)}
                      meetingId={id}
                      agendaItemId={String(preferredAgenda.id)}
                      initialValue={preferredAgenda.notes ? String(preferredAgenda.notes) : ""}
                    />
                  ) : preferredAgenda.notes ? (
                    <div className="meeting-read-note">{String(preferredAgenda.notes)}</div>
                  ) : null}
                </section>

                <details className="meeting-top-more">
                  <summary>
                    <span>Weitere TOP-Optionen</span>
                    <small>
                      {preferredAttachments.length} Anlagen · {preferredExclusions.length} Ausschlüsse
                      {!preferredAgenda.announced_with_invitation ? " · spontaner TOP" : ""}
                    </small>
                  </summary>
                  <div className="meeting-top-more-body">
                    <section className="meeting-focus-section meeting-top-formal-block">
                  <div className="meeting-section-head">
                    <span>Formaler TOP-Status</span>
                    <b className={preferredAgenda.announced_with_invitation ? "top-announced" : "top-spontaneous"}>
                      {preferredAgenda.announced_with_invitation ? "Mit Einladung angekündigt" : "Spontan ergänzt"}
                    </b>
                  </div>

                  {!preferredAgenda.announced_with_invitation && preferredAgenda.decision_basis_note && (
                    <p className="meeting-formal-note">
                      <strong>Begründung für Beschlussfassung:</strong> {String(preferredAgenda.decision_basis_note)}
                    </p>
                  )}

                  {canWrite && ["planned","running"].includes(String(meeting.status)) && !preferredAgenda.resolution_id && (
                    <form action={updateAgendaFormalAction} className="meeting-top-formal-form">
                      <input type="hidden" name="meetingId" value={id} />
                      <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                      <label>
                        Tagesordnungsstatus
                        <select
                          name="announcementStatus"
                          defaultValue={preferredAgenda.announced_with_invitation ? "announced" : "spontaneous"}
                        >
                          <option value="announced">Mit Einladung angekündigt</option>
                          <option value="spontaneous">Nachträglich / spontan ergänzt</option>
                        </select>
                      </label>
                      <label>
                        Begründung bei spontanem TOP
                        <textarea
                          name="decisionBasisNote"
                          rows={2}
                          defaultValue={preferredAgenda.decision_basis_note ? String(preferredAgenda.decision_basis_note) : ""}
                          placeholder="Warum ist eine Behandlung bzw. Beschlussfassung trotz später Aufnahme zulässig?"
                        />
                      </label>
                      <button className="mini-button">Formalen Status speichern</button>
                    </form>
                  )}
                </section>

                <section className="meeting-focus-section">
                  <div className="meeting-section-head">
                    <span>Befangenheit / Stimmrechtsausschluss</span>
                    <b>{preferredExclusions.length}</b>
                  </div>

                  {preferredExclusions.length===0 ? (
                    <p className="muted-copy">Für diesen TOP ist aktuell niemand von der Abstimmung ausgeschlossen.</p>
                  ) : (
                    <div className="vote-exclusion-list">
                      {preferredExclusions.map((entry)=>(
                        <div key={String(entry.id)}>
                          <div>
                            <strong>{String(entry.person_name)}</strong>
                            <span>{String(entry.reason)}</span>
                          </div>
                          {canWrite && meetingRunning && !preferredAgenda.resolution_id && (
                            <form action={deleteVoteExclusionAction}>
                              <input type="hidden" name="meetingId" value={id} />
                              <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                              <input type="hidden" name="exclusionId" value={String(entry.id)} />
                              <button className="mini-button">Entfernen</button>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {canWrite && meetingRunning && !preferredAgenda.resolution_id && (
                    <form action={addVoteExclusionAction} className="vote-exclusion-form">
                      <input type="hidden" name="meetingId" value={id} />
                      <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                      <label>
                        Person
                        <select name="memberId" defaultValue="" required>
                          <option value="" disabled>Person auswählen</option>
                          {attendees
                            .filter((row)=>row.attendance==="present" && row.voting_eligible===true)
                            .map((row)=>(
                              <option value={String(row.member_id)} key={String(row.member_id)}>
                                {String(row.first_name)} {String(row.last_name)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Grund
                        <input name="reason" required placeholder="z. B. persönlicher Interessenkonflikt" />
                      </label>
                      <button className="mini-button">Ausschluss dokumentieren</button>
                    </form>
                  )}
                </section>

                <section className="meeting-focus-section">
                  <div className="meeting-section-head">
                    <span>Anlagen</span>
                    <b>{preferredAttachments.length}</b>
                  </div>

                  {preferredAttachments.length===0 ? (
                    <p className="muted-copy">Noch keine Unterlagen mit diesem TOP verknüpft.</p>
                  ) : (
                    <div className="meeting-attachment-list">
                      {preferredAttachments.map((doc)=>(
                        <div key={String(doc.id)}>
                          <div>
                            <strong>{String(doc.title)}</strong>
                            <span>{doc.original_filename ? String(doc.original_filename) : "Dokument"}</span>
                          </div>
                          <div>
                            <Link href={"/api/documents/"+String(doc.id)+"/file"} target="_blank" className="mini-button">Öffnen</Link>
                            {canDocumentsWrite && ["planned","running"].includes(String(meeting.status)) && (
                              <form action={removeMeetingAttachmentAction}>
                                <input type="hidden" name="meetingId" value={id} />
                                <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                                <input type="hidden" name="documentId" value={String(doc.id)} />
                                <button className="mini-button">Entfernen</button>
                              </form>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {canDocumentsWrite && ["planned","running"].includes(String(meeting.status)) && (
                    <form action={uploadMeetingAttachmentAction} className="meeting-attachment-upload" encType="multipart/form-data">
                      <input type="hidden" name="meetingId" value={id} />
                      <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                      <label>Titel<input name="title" placeholder="Optional" /></label>
                      <label>Datei
                        <input
                          name="file"
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp"
                          required
                        />
                      </label>
                      <button className="mini-button">Anlage hochladen</button>
                    </form>
                  )}
                </section>

                    </div>
                </details>

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
                        <span>Ergebnis <b>{outcomeLabels[String(preferredAgenda.decision_outcome)] ?? "Offen"}</b></span>
                        <span>Abstimmung <b>{voteMethodLabels[String(preferredAgenda.vote_method)] ?? "–"}</b></span>
                        <span>Stimmberechtigt <b>{Number(preferredAgenda.eligible_voters ?? 0)}</b></span>
                        <span>Ausgeschlossen <b>{Number(preferredAgenda.excluded_voters ?? 0)}</b></span>
                        <span>Ja <b>{Number(preferredAgenda.votes_yes)}</b></span>
                        <span>Nein <b>{Number(preferredAgenda.votes_no)}</b></span>
                        <span>Enthaltung <b>{Number(preferredAgenda.votes_abstain)}</b></span>
                        {preferredAgenda.task_id && (
                          <span>Aufgabe <b>{taskStatusLabel(preferredAgenda.task_status)}</b></span>
                        )}
                        {preferredAgenda.vote_details && (
                          <span>Namentlich <b>{String(preferredAgenda.vote_details)}</b></span>
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

                {canWrite && !preferredAgenda.resolution_id && (
                  <details className="meeting-top-danger-more">
                    <summary>••• Weitere Aktionen</summary>
                    <form action={deleteAgendaItemAction} className="meeting-top-delete">
                      <input type="hidden" name="meetingId" value={id} />
                      <input type="hidden" name="agendaItemId" value={String(preferredAgenda.id)} />
                      <ConfirmSubmitButton message={"TOP „"+String(preferredAgenda.title)+"“ wirklich löschen?"}>
                        TOP löschen
                      </ConfirmSubmitButton>
                    </form>
                  </details>
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
                          <label>
                            Antrag / exakter Beschlusstext
                            <textarea
                              name="decisionText"
                              rows={4}
                              required
                              placeholder="Der Vorstand beschließt …"
                            />
                          </label>

                          <div className="form-grid">
                            <label>
                              Abstimmungsart
                              <select name="voteMethod" defaultValue="show_of_hands">
                                <option value="show_of_hands">Handzeichen</option>
                                <option value="open">Offen</option>
                                <option value="roll_call">Namentlich</option>
                                <option value="secret">Geheim</option>
                                <option value="electronic">Elektronisch</option>
                              </select>
                            </label>
                            <label>
                              Ergebnis
                              <select name="decisionOutcome" defaultValue="" required>
                                <option value="" disabled>Ergebnis auswählen</option>
                                <option value="accepted">Angenommen</option>
                                <option value="rejected">Abgelehnt</option>
                              </select>
                            </label>
                          </div>

                          <label>
                            Namentliche Stimmen / Abstimmungsdetails
                            <textarea
                              name="voteDetails"
                              rows={3}
                              placeholder="Nur bei namentlicher Abstimmung erforderlich, z. B. Max Mustermann: Ja · Erika Beispiel: Enthaltung"
                            />
                          </label>

                          <div className="vote-formal-summary">
                            <label>
                              Stimmberechtigte bei diesem TOP
                              <input
                                name="eligibleVoters"
                                type="number"
                                min="0"
                                defaultValue={eligibleForCurrentVote}
                                required
                              />
                            </label>
                            <span>
                              {presentVoterCount} anwesend stimmberechtigt · {preferredExclusions.length} ausgeschlossen
                            </span>
                          </div>

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

        <aside className="meeting-check-rail">
          <div className="meeting-check-head">
            <span className="eyebrow">Schriftführer-Check</span>
            <h2>Sitzungsstand</h2>
          </div>

          <div className="meeting-live-status">
            <div className={meeting.quorum_confirmed===true ? "check-ok" : "check-warning"}>
              <b>{meeting.quorum_confirmed===true ? "✓" : "!"}</b>
              <span>{meeting.quorum_confirmed===true ? "Beschlussfähig" : "Nicht beschlussfähig"}</span>
            </div>
          </div>

          <div className="meeting-check-metrics">
            <div><span>Anwesend</span><strong>{presentCount}/{attendees.length}</strong></div>
            <div><span>Stimmberechtigt</span><strong>{presentVoterCount}</strong></div>
            <div>
              <span>Gäste</span>
              <strong>{guests.filter((row)=>row.attendance==="present").length}/{guests.length}</strong>
            </div>
            <div><span>Offene TOPs</span><strong>{openAgendaCount}</strong></div>
            <div><span>Beschlüsse</span><strong>{agenda.filter((row)=>row.resolution_id).length}</strong></div>
            <div><span>Anlagen</span><strong>{attachments.length}</strong></div>
          </div>

          {(incompleteVoteCount>0 || spontaneousBasisMissing>0) && (
            <div className="meeting-check-warnings">
              {incompleteVoteCount>0 && <span>{incompleteVoteCount} Abstimmung(en) unvollständig</span>}
              {spontaneousBasisMissing>0 && <span>{spontaneousBasisMissing} spontaner TOP ohne Begründung</span>}
            </div>
          )}

        </aside>
        </section>
      )}

      {meetingRunning && canWrite && (
        <details className="meeting-close-drawer" id="abschluss">
          <summary>
            <div>
              <span className="eyebrow">Sitzung beenden</span>
              <strong>Abschlussprüfung öffnen</strong>
              <small>{completionReady ? "Alles vollständig – Sitzung kann beendet werden." : openAgendaCount+" TOP(s) bzw. Angaben noch offen."}</small>
            </div>
            <span className={completionReady ? "formal-state formal-ok" : "formal-state formal-open"}>
              {completionReady ? "Bereit" : "Prüfen"}
            </span>
          </summary>

          <div className="meeting-close-body">
            <div className="meeting-close-grid">
              <div className={officersComplete ? "is-ok" : "is-open"}>
                <b>{officersComplete ? "✓" : "!"}</b>
                <span>Leitung & Protokollführung</span>
              </div>
              <div className={formalitiesDocumented ? "is-ok" : "is-open"}>
                <b>{formalitiesDocumented ? "✓" : "!"}</b>
                <span>Einladung & Beschlussfähigkeit</span>
              </div>
              <div className={unresolvedAttendanceCount===0 ? "is-ok" : "is-open"}>
                <b>{unresolvedAttendanceCount===0 ? "✓" : "!"}</b>
                <span>Mitglieder-Anwesenheit</span>
              </div>
              <div className={unresolvedGuestAttendanceCount===0 ? "is-ok" : "is-open"}>
                <b>{unresolvedGuestAttendanceCount===0 ? "✓" : "!"}</b>
                <span>Gast-Anwesenheit</span>
              </div>
              <div className={openAgendaCount===0 ? "is-ok" : "is-open"}>
                <b>{openAgendaCount===0 ? "✓" : "!"}</b>
                <span>Alle TOPs erledigt/vertagt</span>
              </div>
              <div className={incompleteVoteCount===0 ? "is-ok" : "is-open"}>
                <b>{incompleteVoteCount===0 ? "✓" : "!"}</b>
                <span>Abstimmungen vollständig</span>
              </div>
              <div className={spontaneousBasisMissing===0 ? "is-ok" : "is-open"}>
                <b>{spontaneousBasisMissing===0 ? "✓" : "!"}</b>
                <span>Spontane Beschluss-TOPs begründet</span>
              </div>
            </div>

            {!completionReady && firstOpenAgenda && (
              <div className="meeting-close-help">
                <span>Es ist noch mindestens ein TOP offen.</span>
                <Link href={`/sitzungen/${id}?top=${String(firstOpenAgenda.id)}#live`} className="mini-button">
                  Offenen TOP öffnen
                </Link>
              </div>
            )}

            <form action={updateMeetingStatusAction} className="meeting-close-form">
              <input type="hidden" name="meetingId" value={id} />
              <input type="hidden" name="status" value="completed" />
              <label>
                Abschlussbemerkung
                <textarea
                  name="minutesClosing"
                  rows={3}
                  defaultValue={meeting.minutes_closing ? String(meeting.minutes_closing) : ""}
                  placeholder="Optional: Zusammenfassung oder Hinweis zum Sitzungsende"
                />
              </label>
              <label>
                Nächster Sitzungstermin
                <input name="nextMeetingAt" type="datetime-local" defaultValue={dateTimeLocal(meeting.next_meeting_at)} />
              </label>
              <div className="meeting-close-submit">
                <span>Endzeit wird automatisch gespeichert.</span>
                <button className="primary-button" disabled={!completionReady}>Sitzung jetzt beenden</button>
              </div>
            </form>
          </div>
        </details>
      )}

      {meetingRunning && canWrite && (
        <MeetingLiveOptions meetingId={id} attendees={attendees} guests={guests} />
      )}

      {carryovers.length>0 && canWrite && meeting.status==="planned" && (
        <section className="panel meeting-carryover-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Aus letzter Sitzung offen</span>
              <h2>Offene Punkte übernehmen</h2>
            </div>
            <span className="count-chip">{carryovers.length}</span>
          </div>

          <div className="meeting-carryover-list">
            {carryovers.map((item)=>(
              <article key={String(item.source_type)+"-"+String(item.source_id)}>
                <div>
                  <span>{String(item.source_type)==="agenda" ? "Vertagter TOP" : "Offene Aufgabe"}</span>
                  <strong>{String(item.title)}</strong>
                  {item.detail && <p>{String(item.detail)}</p>}
                  <small>
                    {item.owner_name ? "Verantwortlich: "+String(item.owner_name) : ""}
                    {item.due_date ? (item.owner_name ? " · " : "")+"Frist "+String(item.due_date) : ""}
                  </small>
                </div>
                <form action={String(item.source_type)==="agenda" ? carryForwardAgendaItemAction : carryForwardTaskAction}>
                  <input type="hidden" name="meetingId" value={id} />
                  {String(item.source_type)==="agenda"
                    ? <input type="hidden" name="sourceAgendaItemId" value={String(item.source_id)} />
                    : <input type="hidden" name="sourceTaskId" value={String(item.source_id)} />}
                  <button className="mini-button">Als TOP übernehmen</button>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}

      {["planned","cancelled"].includes(String(meeting.status)) && (
        <section className="meeting-management-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Teilnehmer</span><h2>Vorstand einladen</h2></div>
            <span className="count-chip">{attendees.length}</span>
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
                  <span>{attendee.voting_eligible===false ? "Eingeladen · nicht stimmberechtigt" : "Eingeladen · stimmberechtigt"}</span>
                </div>

                {canWrite && meeting.status==="planned" && (
                  <form action={updateAttendanceAction}>
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="memberId" value={String(attendee.member_id)} />
                    <input type="hidden" name="attendance" value="invited" />
                    <select name="votingEligible" defaultValue={attendee.voting_eligible===false ? "false" : "true"}>
                      <option value="true">Stimmberechtigt</option>
                      <option value="false">Nicht stimmberechtigt</option>
                    </select>
                    <button className="mini-button">Speichern</button>
                  </form>
                )}
                {canWrite && ["planned","cancelled"].includes(String(meeting.status)) && (
                  <form action={removeAttendeeAction} className="attendee-remove-form">
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="memberId" value={String(attendee.member_id)} />
                    <ConfirmSubmitButton
                      message={"„"+String(attendee.first_name)+" "+String(attendee.last_name)+"“ aus dieser Sitzung entfernen?"}
                    >
                      Entfernen
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>

          {canWrite && meeting.status==="planned" && availableMembers.length>0 && (
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

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Gäste</span><h2>Externe Teilnehmer</h2></div>
            <span className="count-chip">{guests.length}</span>
          </div>

          <div className="meeting-guest-list">
            {guests.length===0 ? (
              <div className="empty-state">Keine Gäste dokumentiert.</div>
            ) : guests.map((guest)=>(
              <div key={String(guest.id)}>
                <div>
                  <strong>{String(guest.name)}</strong>
                  <span>
                    {guest.organization ? String(guest.organization) : "Gast"}
                    {" · "}
                    Eingeladen
                    {guest.note ? " · "+String(guest.note) : ""}
                  </span>
                </div>
                {canWrite && meeting.status==="planned" && (
                  <form action={deleteMeetingGuestAction}>
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="guestId" value={String(guest.id)} />
                    <button className="mini-button">Entfernen</button>
                  </form>
                )}
              </div>
            ))}
          </div>

          {canWrite && meeting.status==="planned" && (
            <form action={addMeetingGuestAction} className="form-stack meeting-guest-form">
              <input type="hidden" name="meetingId" value={id} />
              <label>Name<input name="name" required /></label>
              <label>Organisation / Funktion<input name="organization" placeholder="Optional" /></label>
              <label>Hinweis<input name="note" placeholder="Optional" /></label>
              <button className="ghost-button">Gast hinzufügen</button>
            </form>
          )}
        </article>

        {canWrite && meeting.status==="planned" && (
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Tagesordnung</span><h2>TOP hinzufügen</h2></div>
            </div>
            <form action={addAgendaItemAction} className="form-stack">
              <input type="hidden" name="meetingId" value={id} />
              <label>Titel<input name="title" required /></label>
              <label>Sachverhalt / Vorbereitung<textarea name="description" rows={3} /></label>
              <small className="form-hint">
                Vor Versand der Einladung = angekündigt. Danach hinzugefügte TOPs werden automatisch als nachträglich markiert.
              </small>
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
      )}

      {meeting.status==="planned" && canWrite && (
        <MeetingStartPanel
          meetingId={id}
          attendees={attendees}
          guests={guests}
          ready={preparationReady}
          missing={preparationMissing}
          chairMemberId={String(meeting.chair_member_id ?? "")}
          minuteTakerMemberId={String(meeting.minute_taker_member_id ?? "")}
          quorumBasis={String(meeting.quorum_basis ?? "")}
          quorumNote={String(meeting.quorum_note ?? "")}
        />
      )}

      {meeting.status==="completed" && (
        <section className="meeting-completed-next">
          <div>
            <span className="eyebrow">Sitzung abgeschlossen</span>
            <h2>Als Nächstes: Protokoll prüfen</h2>
            <p>Teilnahme, TOP-Ergebnisse, Beschlüsse und Anlagen wurden automatisch in das Protokoll übernommen.</p>
          </div>
          <Link href={`/sitzungen/${id}/protokoll`} className="primary-button">Protokoll öffnen</Link>
        </section>
      )}
    </div>
  );
}
