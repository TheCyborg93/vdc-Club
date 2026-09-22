import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  addAgendaItemCorrectionAction,
  addMeetingAttendeeCorrectionAction,
  addMeetingGuestCorrectionAction,
  addResolutionCorrectionAction,
  addVoteExclusionCorrectionAction,
  correctAgendaItemAction,
  correctCompletedMeetingAction,
  correctMeetingAttendeeAction,
  correctMeetingGuestAction,
  correctResolutionAction,
  removeAgendaItemCorrectionAction,
  removeMeetingAttendeeCorrectionAction,
  removeMeetingGuestCorrectionAction,
  removeResolutionCorrectionAction,
  removeVoteExclusionCorrectionAction,
} from "@/app/sitzungen/correction-actions";
import {
  removeMeetingAttachmentAction,
  removeMeetingGeneralAttachmentAction,
  uploadMeetingAttachmentAction,
  uploadMeetingGeneralAttachmentAction,
} from "@/app/sitzungen/attachment-actions";

export const dynamic="force-dynamic";

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

function formatDateTime(value:unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

const errors:Record<string,string>={
  missing:"Bitte alle Pflichtfelder und einen Änderungsgrund ausfüllen.",
  votes:"Die Stimmenangaben sind ungültig oder passen nicht zu den Stimmberechtigten.",
  rollcall:"Bei namentlicher Abstimmung müssen die Abstimmungsdetails ausgefüllt sein.",
  person_exists:"Diese Person ist bereits als Teilnehmer eingetragen.",
  officer_remove:"Sitzungsleitung oder Protokollführung zuerst auf eine andere Person ändern.",
  officer_missing:"Sitzungsleitung und Protokollführung müssen als Teilnehmer dieser Sitzung geführt werden.",
  agenda_dependencies:"Der TOP hat noch einen Beschluss, eine Anlage, Aufgabe oder einen Abstimmungsausschluss. Diese Verknüpfungen zuerst korrigieren.",
  exclusion_person:"Nur anwesende stimmberechtigte Teilnehmer können als von der Abstimmung ausgeschlossen dokumentiert werden.",
  resolution_exists:"Für diesen TOP existiert bereits ein Beschluss.",
  resolution_task:"Der Beschluss kann nicht entfernt werden, solange eine aktive Folgeaufgabe damit verknüpft ist.",
  attachment_reason:"Bei Änderungen an Anlagen ist ein Änderungsgrund erforderlich.",
};

export default async function MeetingCorrectionPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{error?:string;saved?:string}>;
}) {
  const actor=await requirePermission("meetings.read");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const {id}=await params;
  const query=await searchParams;

  const [meetingRows,members,attendees,guests,agenda,attachments,exclusions,changes]=await Promise.all([
    sql`
      SELECT
        m.*,
        chair.first_name AS chair_first_name,
        chair.last_name AS chair_last_name,
        taker.first_name AS taker_first_name,
        taker.last_name AS taker_last_name
      FROM meetings m
      LEFT JOIN members chair ON chair.id=m.chair_member_id
      LEFT JOIN members taker ON taker.id=m.minute_taker_member_id
      WHERE m.id=${id}::uuid
        AND m.deleted_at IS NULL
      LIMIT 1
    `,
    sql`
      SELECT id::text,first_name,last_name
      FROM members
      WHERE status='active'
      ORDER BY last_name,first_name
    `,
    sql`
      SELECT
        ma.member_id::text,ma.attendance,ma.voting_eligible,
        m.first_name,m.last_name
      FROM meeting_attendees ma
      JOIN members m ON m.id=ma.member_id
      WHERE ma.meeting_id=${id}::uuid
      ORDER BY m.last_name,m.first_name
    `,
    sql`
      SELECT id::text,name,organization,note,attendance
      FROM meeting_guests
      WHERE meeting_id=${id}::uuid
      ORDER BY created_at,name
    `,
    sql`
      SELECT
        ai.id::text,ai.position,ai.title,ai.description,ai.notes,ai.agenda_type,
        ai.status,ai.announced_with_invitation,ai.decision_basis_note,
        r.id::text AS resolution_id,r.title AS resolution_title,r.decision_text,
        r.vote_method,r.vote_details,r.eligible_voters,r.excluded_voters,
        r.votes_yes,r.votes_no,r.votes_abstain,r.decision_outcome
      FROM agenda_items ai
      LEFT JOIN resolutions r ON r.agenda_item_id=ai.id
      WHERE ai.meeting_id=${id}::uuid
      ORDER BY ai.position
    `,
    sql`
      SELECT
        d.id::text,d.agenda_item_id::text,d.title,d.original_filename
      FROM documents d
      WHERE d.meeting_id=${id}::uuid
        AND d.category='Sitzungsanlage'
        AND d.deleted_at IS NULL
      ORDER BY d.created_at
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
        l.id::text,l.entity_type,l.action,l.reason,l.created_at,
        u.display_name AS changed_by_name
      FROM meeting_change_log l
      LEFT JOIN app_users u ON u.id=l.changed_by
      WHERE l.meeting_id=${id}::uuid
      ORDER BY l.created_at DESC
      LIMIT 100
    `,
  ]);

  const meeting=meetingRows[0];
  if (!meeting) redirect("/sitzungen?error=missing");
  if (String(meeting.status)!=="completed" || String(meeting.minutes_status)!=="draft") {
    redirect(`/sitzungen/${id}/protokoll?error=minutes_locked`);
  }

  const canWrite=hasPermission(actor.roles,"meetings.write");
  const canResolve=hasPermission(actor.roles,"resolutions.write");
  const canDocumentsWrite=hasPermission(actor.roles,"documents.write");
  const generalAttachments=attachments.filter((doc)=>!doc.agenda_item_id);
  const attendeeIds=new Set(attendees.map((row)=>String(row.member_id)));
  const availableMembers=members.filter((row)=>!attendeeIds.has(String(row.id)));
  const presentVotingCount=attendees.filter(
    (row)=>row.attendance==="present" && row.voting_eligible===true,
  ).length;

  const formalReady=
    Boolean(meeting.invited_at) &&
    Boolean(String(meeting.invitation_method ?? "").trim()) &&
    meeting.invitation_timely!=null &&
    meeting.agenda_sent_with_invitation!=null &&
    meeting.quorum_confirmed!=null &&
    Boolean(meeting.chair_member_id && meeting.minute_taker_member_id);
  const chairPresent=attendees.some(
    (row)=>row.attendance==="present" && String(row.member_id)===String(meeting.chair_member_id),
  );
  const minuteTakerPresent=attendees.some(
    (row)=>row.attendance==="present" && String(row.member_id)===String(meeting.minute_taker_member_id),
  );
  const unresolvedAttendeeCount=attendees.filter((row)=>row.attendance==="invited").length;
  const unresolvedGuestCount=guests.filter((row)=>row.attendance==="invited").length;
  const unfinishedAgendaCount=agenda.filter(
    (row)=>!["done","deferred"].includes(String(row.status)),
  ).length;
  const decisionWithoutResolutionCount=agenda.filter(
    (row)=>row.agenda_type==="decision" && row.status==="done" && !row.resolution_id,
  ).length;
  const invalidVoteAgendaIds=new Set(
    agenda
      .filter((row)=>{
        if (!row.resolution_id) return false;
        const eligible=row.eligible_voters==null ? null : Number(row.eligible_voters);
        const total=Number(row.votes_yes ?? 0)+Number(row.votes_no ?? 0)+Number(row.votes_abstain ?? 0);
        const exclusionCount=exclusions.filter(
          (entry)=>String(entry.agenda_item_id)===String(row.id),
        ).length;
        return !row.vote_method ||
          !row.decision_outcome ||
          eligible==null ||
          eligible!==total ||
          Number(row.excluded_voters ?? 0)!==exclusionCount ||
          (row.vote_method==="roll_call" && !String(row.vote_details ?? "").trim());
      })
      .map((row)=>String(row.id)),
  );
  const spontaneousAgendaIds=new Set(
    agenda
      .filter(
        (row)=>row.resolution_id &&
          row.announced_with_invitation===false &&
          !String(row.decision_basis_note ?? "").trim(),
      )
      .map((row)=>String(row.id)),
  );
  const decisionMissingAgendaIds=new Set(
    agenda
      .filter((row)=>row.agenda_type==="decision" && row.status==="done" && !row.resolution_id)
      .map((row)=>String(row.id)),
  );
  const unfinishedAgendaIds=new Set(
    agenda
      .filter((row)=>!["done","deferred"].includes(String(row.status)))
      .map((row)=>String(row.id)),
  );
  const agendaIssueIds=new Set([
    ...invalidVoteAgendaIds,
    ...spontaneousAgendaIds,
    ...decisionMissingAgendaIds,
    ...unfinishedAgendaIds,
  ]);
  const resolutionCount=agenda.filter((row)=>row.resolution_id).length;
  const protocolReady=
    formalReady &&
    chairPresent &&
    minuteTakerPresent &&
    unresolvedAttendeeCount===0 &&
    unresolvedGuestCount===0 &&
    unfinishedAgendaCount===0 &&
    decisionWithoutResolutionCount===0 &&
    invalidVoteAgendaIds.size===0 &&
    spontaneousAgendaIds.size===0 &&
    (resolutionCount===0 || meeting.quorum_confirmed===true);
  const issueCount=
    (!formalReady ? 1 : 0) +
    (!chairPresent || !minuteTakerPresent ? 1 : 0) +
    unresolvedAttendeeCount +
    unresolvedGuestCount +
    unfinishedAgendaCount +
    decisionWithoutResolutionCount +
    invalidVoteAgendaIds.size +
    spontaneousAgendaIds.size +
    (resolutionCount>0 && meeting.quorum_confirmed!==true ? 1 : 0);
  const attendanceNeedsAttention=
    !chairPresent ||
    !minuteTakerPresent ||
    unresolvedAttendeeCount>0 ||
    unresolvedGuestCount>0;
  const agendaNeedsAttention=agendaIssueIds.size>0;

  if (!canWrite) redirect(`/sitzungen/${id}/protokoll?error=forbidden`);

  return (
    <div className="page-stack meeting-correction-page">
      <section className="meeting-correction-hero">
        <div>
          <Link href={`/sitzungen/${id}/protokoll`} className="back-link">← Protokoll</Link>
          <span className="eyebrow">Nachbearbeitung</span>
          <h1>{String(meeting.title)}</h1>
          <p>Alle Korrekturen werden mit Zeitpunkt, Benutzer und Änderungsgrund protokolliert.</p>
        </div>
        <span className="minutes-status minutes-draft">Entwurf</span>
      </section>

      {query.error && <div className="form-error">{errors[query.error] ?? "Änderung konnte nicht gespeichert werden."}</div>}
      {query.saved && <div className="form-success">Korrektur wurde gespeichert und im Änderungsverlauf protokolliert.</div>}

      <section className={"meeting-correction-guide "+(protocolReady ? "is-ready" : "needs-attention")}>
        <div className="meeting-correction-guide-head">
          <div>
            <span className="eyebrow">Korrekturassistent</span>
            <h2>{protocolReady ? "Protokoll ist vollständig" : issueCount+" Punkt(e) noch prüfen"}</h2>
            <p>
              {protocolReady
                ? "Alle Pflichtprüfungen sind erfüllt. Du kannst direkt zurück zum Protokoll und es zur Freigabe einreichen."
                : "Öffne nur die Bereiche mit Hinweis. Bereits vollständige Bereiche bleiben kompakt geschlossen."}
            </p>
          </div>
          <Link href={`/sitzungen/${id}/protokoll`} className={protocolReady ? "primary-button" : "ghost-button"}>
            {protocolReady ? "Zurück & einreichen" : "Zur Protokollübersicht"}
          </Link>
        </div>

        <nav className="meeting-correction-guide-grid" aria-label="Nachbearbeitungsbereiche">
          <a href="#korrektur-formalia" className={!formalReady ? "has-issue" : "is-ok"}>
            <b>{formalReady ? "✓" : "!"}</b>
            <span><strong>Formalia</strong><small>{formalReady ? "vollständig" : "Angaben prüfen"}</small></span>
          </a>
          <a href="#korrektur-teilnahme" className={attendanceNeedsAttention ? "has-issue" : "is-ok"}>
            <b>{attendanceNeedsAttention ? "!" : "✓"}</b>
            <span>
              <strong>Teilnahme</strong>
              <small>{attendanceNeedsAttention ? "Anwesenheit/Rollen prüfen" : "vollständig"}</small>
            </span>
          </a>
          <a href="#korrektur-tops" className={agendaNeedsAttention ? "has-issue" : "is-ok"}>
            <b>{agendaNeedsAttention ? "!" : "✓"}</b>
            <span>
              <strong>TOPs & Beschlüsse</strong>
              <small>{agendaNeedsAttention ? agendaIssueIds.size+" TOP(s) prüfen" : "vollständig"}</small>
            </span>
          </a>
          <a href="#korrektur-anlagen" className="is-neutral">
            <b>↗</b>
            <span><strong>Anlagen</strong><small>{attachments.length} hinterlegt</small></span>
          </a>
        </nav>
      </section>

      <details className="panel meeting-correction-section meeting-correction-group" id="korrektur-formalia" open={!formalReady}>
        <summary className="meeting-correction-group-summary">
          <div>
            <span className="eyebrow">Sitzung</span>
            <strong>Rahmen & Protokolltexte</strong>
            <small>{formalReady ? "Formalia vollständig" : "Formalia benötigen Aufmerksamkeit"}</small>
          </div>
          <span className={formalReady ? "correction-state is-ok" : "correction-state has-issue"}>
            {formalReady ? "Vollständig" : "Prüfen"}
          </span>
        </summary>

        <div className="meeting-correction-group-body">
        <form action={correctCompletedMeetingAction} className="meeting-correction-form">
          <input type="hidden" name="meetingId" value={id} />
          <div className="form-grid">
            <label>Titel<input name="title" defaultValue={String(meeting.title)} required /></label>
            <label>Ort<input name="location" defaultValue={String(meeting.location ?? "")} /></label>
          </div>
          <div className="form-grid">
            <label>Geplant<input name="startsAt" type="datetime-local" defaultValue={dateTimeLocal(meeting.starts_at)} required /></label>
            <label>Tatsächlicher Beginn<input name="openedAt" type="datetime-local" defaultValue={dateTimeLocal(meeting.opened_at ?? meeting.starts_at)} required /></label>
          </div>
          <div className="form-grid">
            <label>Tatsächliches Ende<input name="endedAt" type="datetime-local" defaultValue={dateTimeLocal(meeting.ended_at)} required /></label>
            <label>Sitzungsart
              <select name="meetingMode" defaultValue={String(meeting.meeting_mode ?? "in_person")}>
                <option value="in_person">Präsenz</option>
                <option value="hybrid">Hybrid</option>
                <option value="online">Online</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>Sitzungsleitung
              <select name="chairMemberId" defaultValue={String(meeting.chair_member_id ?? "")} required>
                <option value="" disabled>Bitte auswählen</option>
                {attendees.map((row)=>(
                  <option key={String(row.member_id)} value={String(row.member_id)}>
                    {String(row.first_name)} {String(row.last_name)}
                  </option>
                ))}
              </select>
            </label>
            <label>Protokollführung
              <select name="minuteTakerMemberId" defaultValue={String(meeting.minute_taker_member_id ?? "")} required>
                <option value="" disabled>Bitte auswählen</option>
                {attendees.map((row)=>(
                  <option key={String(row.member_id)} value={String(row.member_id)}>
                    {String(row.first_name)} {String(row.last_name)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>Einladung versendet<input name="invitedAt" type="datetime-local" defaultValue={dateTimeLocal(meeting.invited_at)} required /></label>
            <label>Einladungsweg<input name="invitationMethod" defaultValue={String(meeting.invitation_method ?? "")} required /></label>
          </div>
          <div className="form-grid">
            <label>Einladung fristgerecht?
              <select name="invitationTimely" defaultValue={meeting.invitation_timely===false ? "no" : "yes"}>
                <option value="yes">Ja</option><option value="no">Nein</option>
              </select>
            </label>
            <label>Tagesordnung mit Einladung?
              <select name="agendaSentWithInvitation" defaultValue={meeting.agenda_sent_with_invitation===false ? "no" : "yes"}>
                <option value="yes">Ja</option><option value="no">Nein</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>Beschlussfähig?
              <select name="quorumConfirmed" defaultValue={meeting.quorum_confirmed===false ? "no" : "yes"}>
                <option value="yes">Ja</option><option value="no">Nein</option>
              </select>
            </label>
            <label>Grundlage / Satzung<input name="quorumBasis" defaultValue={String(meeting.quorum_basis ?? "")} /></label>
          </div>
          <label>Bemerkung Beschlussfähigkeit<textarea name="quorumNote" rows={2} defaultValue={String(meeting.quorum_note ?? "")} /></label>
          <label>Formale Besonderheiten<textarea name="formalitiesNote" rows={2} defaultValue={String(meeting.formalities_note ?? "")} /></label>
          <label>Einleitung<textarea name="minutesIntro" rows={3} defaultValue={String(meeting.minutes_intro ?? "")} /></label>
          <label>Abschluss<textarea name="minutesClosing" rows={3} defaultValue={String(meeting.minutes_closing ?? "")} /></label>
          <label className="correction-reason">Änderungsgrund<input name="reason" required placeholder="Warum wird die fertige Sitzung korrigiert?" /></label>
          <button className="primary-button">Sitzungsdaten korrigieren</button>
        </form>
        </div>
      </details>

      <details className="panel meeting-correction-group" id="korrektur-teilnahme" open={attendanceNeedsAttention}>
        <summary className="meeting-correction-group-summary">
          <div>
            <span className="eyebrow">Teilnahme</span>
            <strong>Vorstand & Gäste</strong>
            <small>{attendees.length} Vorstand · {guests.length} Gäste</small>
          </div>
          <span className={attendanceNeedsAttention ? "correction-state has-issue" : "correction-state is-ok"}>
            {attendanceNeedsAttention ? "Prüfen" : "Vollständig"}
          </span>
        </summary>
        <div className="meeting-correction-group-body">
      <section className="meeting-correction-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Teilnahme</span><h2>Vorstand</h2></div>
            <span className="count-chip">{attendees.length}</span>
          </div>
          <div className="meeting-correction-list">
            {attendees.map((row)=>(
              <form action={correctMeetingAttendeeAction} key={String(row.member_id)}>
                <input type="hidden" name="meetingId" value={id} />
                <input type="hidden" name="memberId" value={String(row.member_id)} />
                <strong>{String(row.first_name)} {String(row.last_name)}</strong>
                <select name="attendance" defaultValue={String(row.attendance)}>
                  <option value="present">Anwesend</option>
                  <option value="excused">Entschuldigt</option>
                  <option value="absent">Abwesend</option>
                </select>
                <select name="votingEligible" defaultValue={row.voting_eligible===false ? "false" : "true"}>
                  <option value="true">Stimmberechtigt</option>
                  <option value="false">Nicht stimmberechtigt</option>
                </select>
                <input name="reason" required placeholder="Änderungsgrund" />
                <button className="mini-button">Korrigieren</button>
              </form>
            ))}
          </div>
          <div className="meeting-correction-remove-list">
            {attendees.map((row)=>(
              <form action={removeMeetingAttendeeCorrectionAction} key={"remove-"+String(row.member_id)}>
                <input type="hidden" name="meetingId" value={id} />
                <input type="hidden" name="memberId" value={String(row.member_id)} />
                <span>{String(row.first_name)} {String(row.last_name)}</span>
                <input name="reason" required placeholder="Grund für Entfernung" />
                <button className="meeting-agenda-delete">Entfernen</button>
              </form>
            ))}
          </div>

          {availableMembers.length>0 && (
            <form action={addMeetingAttendeeCorrectionAction} className="meeting-correction-add-form">
              <input type="hidden" name="meetingId" value={id} />
              <select name="memberId" defaultValue="" required>
                <option value="" disabled>Mitglied nachtragen</option>
                {availableMembers.map((member)=>(
                  <option key={String(member.id)} value={String(member.id)}>
                    {String(member.first_name)} {String(member.last_name)}
                  </option>
                ))}
              </select>
              <select name="attendance" defaultValue="present">
                <option value="present">Anwesend</option>
                <option value="excused">Entschuldigt</option>
                <option value="absent">Abwesend</option>
              </select>
              <select name="votingEligible" defaultValue="true">
                <option value="true">Stimmberechtigt</option>
                <option value="false">Nicht stimmberechtigt</option>
              </select>
              <input name="reason" required placeholder="Änderungsgrund" />
              <button className="mini-button">Person nachtragen</button>
            </form>
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Teilnahme</span><h2>Gäste</h2></div>
            <span className="count-chip">{guests.length}</span>
          </div>
          <div className="meeting-correction-list">
            {guests.length===0 ? <div className="empty-state">Keine Gäste.</div> : guests.map((row)=>(
              <form action={correctMeetingGuestAction} key={String(row.id)}>
                <input type="hidden" name="meetingId" value={id} />
                <input type="hidden" name="guestId" value={String(row.id)} />
                <input name="name" defaultValue={String(row.name)} required />
                <input name="organization" defaultValue={String(row.organization ?? "")} placeholder="Organisation" />
                <select name="attendance" defaultValue={String(row.attendance)}>
                  <option value="present">Anwesend</option>
                  <option value="absent">Abwesend</option>
                </select>
                <input name="note" defaultValue={String(row.note ?? "")} placeholder="Hinweis" />
                <input name="reason" required placeholder="Änderungsgrund" />
                <button className="mini-button">Korrigieren</button>
              </form>
            ))}
          </div>

          <form action={addMeetingGuestCorrectionAction} className="meeting-correction-add-form">
            <input type="hidden" name="meetingId" value={id} />
            <input name="name" required placeholder="Gast nachtragen" />
            <input name="organization" placeholder="Organisation / Funktion" />
            <select name="attendance" defaultValue="present">
              <option value="present">Anwesend</option>
              <option value="absent">Abwesend</option>
            </select>
            <input name="note" placeholder="Hinweis" />
            <input name="reason" required placeholder="Änderungsgrund" />
            <button className="mini-button">Gast nachtragen</button>
          </form>

          {guests.length>0 && (
            <div className="meeting-correction-remove-list">
              {guests.map((row)=>(
                <form action={removeMeetingGuestCorrectionAction} key={"remove-guest-"+String(row.id)}>
                  <input type="hidden" name="meetingId" value={id} />
                  <input type="hidden" name="guestId" value={String(row.id)} />
                  <span>{String(row.name)}</span>
                  <input name="reason" required placeholder="Grund für Entfernung" />
                  <button className="meeting-agenda-delete">Entfernen</button>
                </form>
              ))}
            </div>
          )}
        </article>
      </section>
        </div>
      </details>

      <details className="panel meeting-correction-section meeting-correction-group" id="korrektur-anlagen">
        <summary className="meeting-correction-group-summary">
          <div>
            <span className="eyebrow">Unterlagen</span>
            <strong>Sitzungsanlagen</strong>
            <small>{generalAttachments.length} allgemeine Anlage(n)</small>
          </div>
          <span className="correction-state is-neutral">Optional</span>
        </summary>
        <div className="meeting-correction-group-body">

        {generalAttachments.length===0 ? (
          <div className="empty-state">Keine allgemeinen Sitzungsanlagen.</div>
        ) : (
          <div className="meeting-attachment-list">
            {generalAttachments.map((doc)=>(
              <div key={String(doc.id)}>
                <div>
                  <strong>{String(doc.title)}</strong>
                  <span>{doc.original_filename ? String(doc.original_filename) : "Dokument"}</span>
                </div>
                <div>
                  <Link href={"/api/documents/"+String(doc.id)+"/file"} target="_blank" className="mini-button">Öffnen</Link>
                  {canDocumentsWrite && (
                    <form action={removeMeetingGeneralAttachmentAction}>
                      <input type="hidden" name="meetingId" value={id} />
                      <input type="hidden" name="documentId" value={String(doc.id)} />
                      <input type="hidden" name="returnTo" value={`/sitzungen/${id}/korrektur`} />
                      <input name="changeReason" required placeholder="Änderungsgrund" />
                      <button className="mini-button">Entfernen</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canDocumentsWrite && (
          <form action={uploadMeetingGeneralAttachmentAction} className="meeting-general-attachment-upload" encType="multipart/form-data">
            <input type="hidden" name="meetingId" value={id} />
            <input type="hidden" name="returnTo" value={`/sitzungen/${id}/korrektur`} />
            <label>Titel<input name="title" placeholder="Optional" /></label>
            <label>Datei<input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp" required /></label>
            <label>Änderungsgrund<input name="changeReason" required placeholder="Warum wird die Anlage nachgetragen?" /></label>
            <button className="mini-button">Sitzungsanlage hochladen</button>
          </form>
        )}
        </div>
      </details>

      <details className="panel meeting-correction-section meeting-correction-group" id="korrektur-tops" open={agendaNeedsAttention}>
        <summary className="meeting-correction-group-summary">
          <div>
            <span className="eyebrow">Tagesordnung</span>
            <strong>TOPs & Ergebnisse</strong>
            <small>{agenda.length} TOP(s) · {resolutionCount} Beschluss/Beschlüsse</small>
          </div>
          <span className={agendaNeedsAttention ? "correction-state has-issue" : "correction-state is-ok"}>
            {agendaNeedsAttention ? agendaIssueIds.size+" prüfen" : "Vollständig"}
          </span>
        </summary>
        <div className="meeting-correction-group-body">

        <div className="meeting-correction-agenda">
          {agenda.map((item)=>(
            <details
              key={String(item.id)}
              open={agendaIssueIds.has(String(item.id))}
              className={agendaIssueIds.has(String(item.id)) ? "has-correction-issue" : ""}
            >
              <summary>
                <div>
                  <b>TOP {String(item.position).padStart(2,"0")}</b>
                  <strong>{String(item.title)}</strong>
                  <span>{String(item.agenda_type)} · {String(item.status)}</span>
                </div>
                <span className={agendaIssueIds.has(String(item.id)) ? "correction-top-issue" : ""}>
                  {agendaIssueIds.has(String(item.id))
                    ? "Prüfen"
                    : item.resolution_id ? "Beschluss vorhanden" : ""}
                </span>
              </summary>

              <div className="meeting-correction-agenda-body">
                <form action={correctAgendaItemAction} className="meeting-correction-form">
                  <input type="hidden" name="meetingId" value={id} />
                  <input type="hidden" name="agendaItemId" value={String(item.id)} />
                  <div className="form-grid">
                    <label>Titel<input name="title" defaultValue={String(item.title)} required /></label>
                    <label>Typ
                      <select name="agendaType" defaultValue={String(item.agenda_type ?? "consultation")}>
                        <option value="information">Information</option>
                        <option value="consultation">Beratung</option>
                        <option value="decision">Beschluss</option>
                      </select>
                    </label>
                  </div>
                  <label>Sachverhalt<textarea name="description" rows={2} defaultValue={String(item.description ?? "")} /></label>
                  <label>Ergebnis / Protokollnotiz<textarea name="notes" rows={4} defaultValue={String(item.notes ?? "")} /></label>
                  <div className="form-grid">
                    <label>Status
                      <select name="status" defaultValue={String(item.status)==="deferred" ? "deferred" : "done"}>
                        <option value="done">Erledigt</option>
                        <option value="deferred">Vertagt</option>
                      </select>
                    </label>
                    <label>Mit Einladung angekündigt?
                      <select name="announcedWithInvitation" defaultValue={item.announced_with_invitation===false ? "false" : "true"}>
                        <option value="true">Ja</option>
                        <option value="false">Nein</option>
                      </select>
                    </label>
                  </div>
                  <label>Formale Begründung<textarea name="decisionBasisNote" rows={2} defaultValue={String(item.decision_basis_note ?? "")} /></label>
                  <label className="correction-reason">Änderungsgrund<input name="reason" required /></label>
                  <button className="mini-button">TOP korrigieren</button>
                </form>

                {!item.resolution_id && (
                  <form action={removeAgendaItemCorrectionAction} className="meeting-resolution-remove-form">
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="agendaItemId" value={String(item.id)} />
                    <input name="changeReason" required placeholder="Grund für das Entfernen des TOPs" />
                    <button className="meeting-agenda-delete">TOP entfernen</button>
                  </form>
                )}

                <div className="meeting-correction-attachments">
                  <span className="eyebrow">TOP-Anlagen</span>
                  {attachments.filter((doc)=>String(doc.agenda_item_id)===String(item.id)).length===0 ? (
                    <div className="empty-state">Keine Anlagen zu diesem TOP.</div>
                  ) : (
                    <div className="meeting-attachment-list">
                      {attachments
                        .filter((doc)=>String(doc.agenda_item_id)===String(item.id))
                        .map((doc)=>(
                          <div key={String(doc.id)}>
                            <div>
                              <strong>{String(doc.title)}</strong>
                              <span>{doc.original_filename ? String(doc.original_filename) : "Dokument"}</span>
                            </div>
                            <div>
                              <Link href={"/api/documents/"+String(doc.id)+"/file"} target="_blank" className="mini-button">Öffnen</Link>
                              {canDocumentsWrite && (
                                <form action={removeMeetingAttachmentAction}>
                                  <input type="hidden" name="meetingId" value={id} />
                                  <input type="hidden" name="agendaItemId" value={String(item.id)} />
                                  <input type="hidden" name="documentId" value={String(doc.id)} />
                                  <input type="hidden" name="returnTo" value={`/sitzungen/${id}/korrektur`} />
                                  <input name="changeReason" required placeholder="Änderungsgrund" />
                                  <button className="mini-button">Entfernen</button>
                                </form>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {canDocumentsWrite && (
                    <form action={uploadMeetingAttachmentAction} className="meeting-general-attachment-upload" encType="multipart/form-data">
                      <input type="hidden" name="meetingId" value={id} />
                      <input type="hidden" name="agendaItemId" value={String(item.id)} />
                      <input type="hidden" name="returnTo" value={`/sitzungen/${id}/korrektur`} />
                      <label>Titel<input name="title" placeholder="Optional" /></label>
                      <label>Datei<input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp" required /></label>
                      <label>Änderungsgrund<input name="changeReason" required placeholder="Warum wird die Anlage nachgetragen?" /></label>
                      <button className="mini-button">TOP-Anlage hochladen</button>
                    </form>
                  )}
                </div>

                {canResolve && (item.resolution_id || item.agenda_type==="decision") && (
                  <section className="meeting-correction-exclusions">
                    <div className="meeting-section-head">
                      <span>Abstimmungsausschlüsse</span>
                      <b>{exclusions.filter((row)=>String(row.agenda_item_id)===String(item.id)).length}</b>
                    </div>

                    {exclusions.filter((row)=>String(row.agenda_item_id)===String(item.id)).length===0 ? (
                      <div className="empty-state">Keine Person von der Abstimmung ausgeschlossen.</div>
                    ) : (
                      <div className="meeting-correction-remove-list">
                        {exclusions
                          .filter((row)=>String(row.agenda_item_id)===String(item.id))
                          .map((row)=>(
                            <form action={removeVoteExclusionCorrectionAction} key={String(row.id)}>
                              <input type="hidden" name="meetingId" value={id} />
                              <input type="hidden" name="agendaItemId" value={String(item.id)} />
                              <input type="hidden" name="exclusionId" value={String(row.id)} />
                              <span>
                                {String(row.person_name ?? "Person")} · {String(row.reason)}
                              </span>
                              <input name="changeReason" required placeholder="Änderungsgrund" />
                              <button className="meeting-agenda-delete">Ausschluss entfernen</button>
                            </form>
                          ))}
                      </div>
                    )}

                    {attendees.some((row)=>
                      row.attendance==="present" &&
                      row.voting_eligible===true &&
                      !exclusions.some((exclusion)=>
                        String(exclusion.agenda_item_id)===String(item.id) &&
                        String(exclusion.member_id)===String(row.member_id)
                      )
                    ) && (
                      <form action={addVoteExclusionCorrectionAction} className="meeting-correction-add-form">
                        <input type="hidden" name="meetingId" value={id} />
                        <input type="hidden" name="agendaItemId" value={String(item.id)} />
                        <select name="memberId" defaultValue="" required>
                          <option value="" disabled>Person auswählen</option>
                          {attendees
                            .filter((row)=>
                              row.attendance==="present" &&
                              row.voting_eligible===true &&
                              !exclusions.some((exclusion)=>
                                String(exclusion.agenda_item_id)===String(item.id) &&
                                String(exclusion.member_id)===String(row.member_id)
                              )
                            )
                            .map((row)=>(
                              <option key={String(row.member_id)} value={String(row.member_id)}>
                                {String(row.first_name)} {String(row.last_name)}
                              </option>
                            ))}
                        </select>
                        <input name="exclusionReason" required placeholder="Grund für den Ausschluss" />
                        <input name="changeReason" required placeholder="Änderungsgrund" />
                        <button className="mini-button">Ausschluss nachtragen</button>
                      </form>
                    )}
                  </section>
                )}

                {!item.resolution_id && canResolve && (
                  <form action={addResolutionCorrectionAction} className="meeting-correction-form resolution-correction-form">
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="agendaItemId" value={String(item.id)} />
                    <span className="eyebrow">Beschluss nachtragen</span>
                    <label>Titel<input name="title" defaultValue={String(item.title)} required /></label>
                    <label>Beschlusstext<textarea name="decisionText" rows={4} required placeholder="Der Vorstand beschließt …" /></label>
                    <div className="form-grid">
                      <label>Abstimmungsart
                        <select name="voteMethod" defaultValue="show_of_hands">
                          <option value="show_of_hands">Handzeichen</option>
                          <option value="open">Offen</option>
                          <option value="roll_call">Namentlich</option>
                          <option value="secret">Geheim</option>
                          <option value="electronic">Elektronisch</option>
                        </select>
                      </label>
                      <label>Ergebnis
                        <select name="decisionOutcome" defaultValue="accepted">
                          <option value="accepted">Angenommen</option>
                          <option value="rejected">Abgelehnt</option>
                        </select>
                      </label>
                    </div>
                    <label>Namentliche Details<textarea name="voteDetails" rows={2} /></label>
                    <div className="vote-input-grid">
                      <label>Stimmberechtigt<input name="eligibleVoters" type="number" min="0" defaultValue={presentVotingCount} /></label>
                      <label>Ausgeschlossen<input name="excludedVoters" type="number" min="0" defaultValue="0" /></label>
                      <label>Ja<input name="votesYes" type="number" min="0" defaultValue="0" /></label>
                      <label>Nein<input name="votesNo" type="number" min="0" defaultValue="0" /></label>
                      <label>Enthaltung<input name="votesAbstain" type="number" min="0" defaultValue={presentVotingCount} /></label>
                    </div>
                    <label className="correction-reason">Änderungsgrund<input name="reason" required placeholder="Warum wird der Beschluss nachgetragen?" /></label>
                    <button className="mini-button">Beschluss nachtragen</button>
                  </form>
                )}

                {item.resolution_id && canResolve && (
                  <form action={correctResolutionAction} className="meeting-correction-form resolution-correction-form">
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="resolutionId" value={String(item.resolution_id)} />
                    <span className="eyebrow">Beschluss korrigieren</span>
                    <label>Titel<input name="title" defaultValue={String(item.resolution_title ?? "")} required /></label>
                    <label>Beschlusstext<textarea name="decisionText" rows={4} defaultValue={String(item.decision_text ?? "")} required /></label>
                    <div className="form-grid">
                      <label>Abstimmungsart
                        <select name="voteMethod" defaultValue={String(item.vote_method ?? "show_of_hands")}>
                          <option value="show_of_hands">Handzeichen</option>
                          <option value="open">Offen</option>
                          <option value="roll_call">Namentlich</option>
                          <option value="secret">Geheim</option>
                          <option value="electronic">Elektronisch</option>
                        </select>
                      </label>
                      <label>Ergebnis
                        <select name="decisionOutcome" defaultValue={String(item.decision_outcome ?? "accepted")}>
                          <option value="accepted">Angenommen</option>
                          <option value="rejected">Abgelehnt</option>
                        </select>
                      </label>
                    </div>
                    <label>Namentliche Details<textarea name="voteDetails" rows={2} defaultValue={String(item.vote_details ?? "")} /></label>
                    <div className="vote-input-grid">
                      <label>Stimmberechtigt<input name="eligibleVoters" type="number" min="0" defaultValue={Number(item.eligible_voters ?? 0)} /></label>
                      <label>Ausgeschlossen<input name="excludedVoters" type="number" min="0" defaultValue={Number(item.excluded_voters ?? 0)} /></label>
                      <label>Ja<input name="votesYes" type="number" min="0" defaultValue={Number(item.votes_yes ?? 0)} /></label>
                      <label>Nein<input name="votesNo" type="number" min="0" defaultValue={Number(item.votes_no ?? 0)} /></label>
                      <label>Enthaltung<input name="votesAbstain" type="number" min="0" defaultValue={Number(item.votes_abstain ?? 0)} /></label>
                    </div>
                    <label className="correction-reason">Änderungsgrund<input name="reason" required /></label>
                    <button className="mini-button">Beschluss korrigieren</button>
                  </form>
                )}

                {item.resolution_id && canResolve && (
                  <form action={removeResolutionCorrectionAction} className="meeting-resolution-remove-form">
                    <input type="hidden" name="meetingId" value={id} />
                    <input type="hidden" name="resolutionId" value={String(item.resolution_id)} />
                    <input name="reason" required placeholder="Grund für das Entfernen des Beschlusses" />
                    <button className="meeting-agenda-delete">Beschluss entfernen</button>
                  </form>
                )}
              </div>
            </details>
          ))}
        </div>

        <details className="meeting-correction-new-agenda">
          <summary>
            <div>
              <span className="eyebrow">Nachtragen</span>
              <strong>Fehlenden TOP ergänzen</strong>
            </div>
            <b>+</b>
          </summary>
          <form action={addAgendaItemCorrectionAction} className="meeting-correction-form">
            <input type="hidden" name="meetingId" value={id} />
            <div className="form-grid">
              <label>Titel<input name="title" required placeholder="Titel des fehlenden TOPs" /></label>
              <label>Typ
                <select name="agendaType" defaultValue="consultation">
                  <option value="information">Information</option>
                  <option value="consultation">Beratung</option>
                  <option value="decision">Beschluss</option>
                </select>
              </label>
            </div>
            <label>Sachverhalt<textarea name="description" rows={2} /></label>
            <div className="form-grid">
              <label>Status
                <select name="status" defaultValue="done">
                  <option value="done">Erledigt</option>
                  <option value="deferred">Vertagt</option>
                </select>
              </label>
              <label>Mit Einladung angekündigt?
                <select name="announcedWithInvitation" defaultValue="false">
                  <option value="true">Ja</option>
                  <option value="false">Nein / spontan</option>
                </select>
              </label>
            </div>
            <label>Formale Begründung bei spontanem Beschluss-TOP
              <textarea name="decisionBasisNote" rows={2} />
            </label>
            <label className="correction-reason">
              Änderungsgrund
              <input name="changeReason" required placeholder="Warum wird der TOP nachgetragen?" />
            </label>
            <button className="mini-button">TOP nachtragen</button>
          </form>
        </details>
        </div>
      </details>

      <details className="panel meeting-change-history meeting-correction-group" id="korrektur-verlauf">
        <summary className="meeting-correction-group-summary">
          <div>
            <span className="eyebrow">Nachvollziehbarkeit</span>
            <strong>Änderungsverlauf</strong>
            <small>{changes.length} protokollierte Änderung(en)</small>
          </div>
          <span className="correction-state is-neutral">Historie</span>
        </summary>
        <div className="meeting-correction-group-body">

        {changes.length===0 ? (
          <div className="empty-state">Noch keine nachträglichen Korrekturen.</div>
        ) : (
          <div className="meeting-change-list">
            {changes.map((change)=>(
              <article key={String(change.id)}>
                <div>
                  <strong>{String(change.entity_type)} · {String(change.action)}</strong>
                  <span>{formatDateTime(change.created_at)}{change.changed_by_name ? " · "+String(change.changed_by_name) : ""}</span>
                </div>
                <p>{String(change.reason ?? "Ohne Begründung")}</p>
              </article>
            ))}
          </div>
        )}
        </div>
      </details>

      <section className={"meeting-correction-finish "+(protocolReady ? "is-ready" : "needs-attention")}>
        <div>
          <span className="eyebrow">Nachbearbeitung abschließen</span>
          <strong>{protocolReady ? "Alle Prüfungen erfüllt" : issueCount+" Punkt(e) sind noch offen"}</strong>
          <small>
            {protocolReady
              ? "Zurück zum Protokoll und zur Prüfung einreichen."
              : "Die offenen Bereiche sind oben markiert und automatisch aufgeklappt."}
          </small>
        </div>
        <Link href={`/sitzungen/${id}/protokoll`} className={protocolReady ? "primary-button" : "ghost-button"}>
          Zurück zum Protokoll
        </Link>
      </section>
    </div>
  );
}
