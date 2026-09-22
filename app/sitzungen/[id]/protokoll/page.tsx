import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { meetingStatusLabel } from "@/lib/ui-labels";
import {
  approveMeetingMinutesAction,
  returnMeetingMinutesAction,
  submitMeetingMinutesAction,
} from "@/app/sitzungen/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic = "force-dynamic";

const meetingModeLabels:Record<string,string>={
  in_person:"Präsenz",
  hybrid:"Hybrid",
  online:"Online",
};

const agendaTypeLabels:Record<string,string>={
  information:"Information",
  consultation:"Beratung",
  decision:"Beschluss",
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

const minutesStatusLabels:Record<string,string>={
  draft:"Entwurf",
  review:"In Prüfung",
  approved:"Freigegeben",
  archived:"Archiviert",
};

const errors:Record<string,string>={
  minutes_locked:"Das Protokoll kann in diesem Status nicht bearbeitet werden.",
  meeting_not_completed:"Die Sitzung muss zuerst beendet werden, bevor das Protokoll zur Prüfung eingereicht werden kann.",
  officers_missing:"Sitzungsleitung und Protokollführung müssen vor der Einreichung festgelegt werden.",
  return_note:"Bitte einen Grund für die Rückgabe angeben.",
  protocol_formalities:"Die Formalien sind nach der Nachbearbeitung noch nicht vollständig.",
  protocol_officers_present:"Sitzungsleitung und Protokollführung müssen für die Sitzung als anwesend dokumentiert sein.",
  protocol_attendance:"Bei mindestens einer eingeladenen Person oder einem Gast ist die Anwesenheit noch ungeklärt.",
  protocol_agenda:"Mindestens ein Tagesordnungspunkt ist noch nicht erledigt oder vertagt.",
  protocol_decision:"Mindestens ein erledigter Beschluss-TOP hat noch keine dokumentierte Abstimmung.",
  protocol_votes:"Mindestens eine Abstimmung ist unvollständig oder die Stimmenzahl ist nicht plausibel.",
  protocol_spontaneous:"Bei einem nachträglich ergänzten Beschluss-TOP fehlt die formale Begründung.",
  protocol_quorum:"Es sind Beschlüsse vorhanden, obwohl die Beschlussfähigkeit nicht bestätigt ist.",
};

function formatDateTime(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
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

function formatShortDateTime(value:unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",
    month:"2-digit",
    year:"numeric",
    hour:"2-digit",
    minute:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

export default async function MinutesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams:Promise<Record<string,string|undefined>>;
}) {
  const actor=await requirePermission("meetings.read");
  const sql = getDb();
  if (!sql) notFound();

  const { id } = await params;
  const query=await searchParams;

  const [
    meetingRows,
    attendees,
    agenda,
    revisions,
    guests,
    exclusions,
    attachments,
  ] = await Promise.all([
    sql`
      SELECT
        m.id::text,m.title,m.starts_at,m.opened_at,m.ended_at,m.location,m.status,m.notes,
        m.meeting_mode,m.invited_at,m.invitation_method,m.invitation_timely,
        m.agenda_sent_with_invitation,m.quorum_confirmed,m.quorum_note,m.quorum_basis,
        m.formalities_note,m.next_meeting_at,
        m.minutes_intro,m.minutes_closing,m.minutes_status,m.minutes_return_note,
        m.minutes_submitted_at,m.minutes_approved_at,m.minutes_archived_at,
        m.minutes_version,
        chair.id::text AS chair_member_id,
        chair.first_name AS chair_first_name,
        chair.last_name AS chair_last_name,
        taker.id::text AS minute_taker_member_id,
        taker.first_name AS minute_taker_first_name,
        taker.last_name AS minute_taker_last_name,
        submitted.display_name AS submitted_by_name,
        approved.display_name AS approved_by_name,
        archived.display_name AS archived_by_name
      FROM meetings m
      LEFT JOIN members chair ON chair.id=m.chair_member_id
      LEFT JOIN members taker ON taker.id=m.minute_taker_member_id
      LEFT JOIN app_users submitted ON submitted.id=m.minutes_submitted_by
      LEFT JOIN app_users approved ON approved.id=m.minutes_approved_by
      LEFT JOIN app_users archived ON archived.id=m.minutes_archived_by
      WHERE m.id = ${id}::uuid
        AND m.deleted_at IS NULL
      LIMIT 1
    `,
    sql`
      SELECT ma.member_id::text,ma.attendance,ma.voting_eligible,m.first_name,m.last_name
      FROM meeting_attendees ma
      JOIN members m ON m.id = ma.member_id
      WHERE ma.meeting_id = ${id}::uuid
      ORDER BY
        CASE ma.attendance WHEN 'present' THEN 0 WHEN 'excused' THEN 1 ELSE 2 END,
        m.last_name,
        m.first_name
    `,
    sql`
      SELECT
        ai.id::text,
        ai.position,
        ai.title,
        ai.description,
        ai.notes,
        ai.status,
        ai.agenda_type,
        ai.announced_with_invitation,
        ai.decision_basis_note,
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
        t.title AS task_title,
        t.status AS task_status,
        t.due_date,
        owner.first_name AS owner_first_name,
        owner.last_name AS owner_last_name
      FROM agenda_items ai
      LEFT JOIN resolutions r ON r.agenda_item_id = ai.id
      LEFT JOIN tasks t
        ON t.source_type = 'resolution'
       AND t.source_id = r.id
       AND t.status <> 'cancelled'
       AND t.deleted_at IS NULL
      LEFT JOIN members owner ON owner.id = t.owner_member_id
      WHERE ai.meeting_id = ${id}::uuid
      ORDER BY ai.position
    `,
    sql`
      SELECT
        r.version,r.status,r.change_note,r.return_note,r.created_at,
        u.display_name AS changed_by_name
      FROM meeting_minutes_revisions r
      LEFT JOIN app_users u ON u.id=r.changed_by
      WHERE r.meeting_id=${id}::uuid
      ORDER BY r.version DESC,r.created_at DESC
      LIMIT 20
    `,
    sql`
      SELECT id::text,name,organization,note,attendance
      FROM meeting_guests
      WHERE meeting_id=${id}::uuid
      ORDER BY
        CASE attendance WHEN 'present' THEN 0 WHEN 'absent' THEN 1 ELSE 2 END,
        name
    `,
    sql`
      SELECT
        ave.id::text,
        ave.agenda_item_id::text,
        ave.reason,
        COALESCE(m.first_name || ' ' || m.last_name,ave.person_name) AS person_name
      FROM agenda_vote_exclusions ave
      LEFT JOIN members m ON m.id=ave.member_id
      JOIN agenda_items ai ON ai.id=ave.agenda_item_id
      WHERE ai.meeting_id=${id}::uuid
      ORDER BY ave.created_at
    `,
    sql`
      SELECT id::text,agenda_item_id::text,title,original_filename
      FROM documents
      WHERE meeting_id=${id}::uuid
        AND category='Sitzungsanlage'
        AND deleted_at IS NULL
      ORDER BY created_at
    `,
  ]);



  const meeting = meetingRows[0];
  if (!meeting) notFound();

  const present = attendees.filter((row) => row.attendance === "present");
  const excused = attendees.filter((row) => row.attendance === "excused");
  const absent = attendees.filter((row) => ["absent", "invited"].includes(String(row.attendance)));
  const votingPresent=present.filter((row)=>row.voting_eligible===true);
  const presentGuests=guests.filter((row)=>row.attendance==="present");
  const generalAttachments=attachments.filter((doc)=>!doc.agenda_item_id);

  const canWrite=hasPermission(actor.roles,"meetings.write");
  const canApprove=actor.roles.some((role)=>["chair","vice_chair","board","admin"].includes(role));
  const minutesStatus=String(meeting.minutes_status ?? "draft");
  const officersComplete=Boolean(meeting.chair_member_id && meeting.minute_taker_member_id);
  const meetingComplete=String(meeting.status)==="completed";
  if (!meetingComplete) redirect(`/sitzungen/${id}`);
  const resolutionCount=agenda.filter((row)=>row.resolution_number).length;
  const deferredCount=agenda.filter((row)=>row.status==="deferred").length;
  const formalReady=
    Boolean(meeting.invited_at) &&
    Boolean(String(meeting.invitation_method ?? "").trim()) &&
    meeting.invitation_timely!=null &&
    meeting.agenda_sent_with_invitation!=null &&
    meeting.quorum_confirmed!=null &&
    officersComplete;

  const chairPresent=present.some((row)=>String(row.member_id)===String(meeting.chair_member_id));
  const minuteTakerPresent=present.some((row)=>String(row.member_id)===String(meeting.minute_taker_member_id));
  const unresolvedAttendeeCount=attendees.filter((row)=>row.attendance==="invited").length;
  const unresolvedGuestCount=guests.filter((row)=>row.attendance==="invited").length;
  const unfinishedAgendaCount=agenda.filter((row)=>!["done","deferred"].includes(String(row.status))).length;
  const decisionWithoutResolutionCount=agenda.filter(
    (row)=>row.agenda_type==="decision" && row.status==="done" && !row.resolution_number,
  ).length;
  const invalidVoteCount=agenda.filter((row)=>{
    if (!row.resolution_number) return false;
    const eligible=row.eligible_voters==null ? null : Number(row.eligible_voters);
    const voteTotal=Number(row.votes_yes ?? 0)+Number(row.votes_no ?? 0)+Number(row.votes_abstain ?? 0);
    const exclusionCount=exclusions.filter(
      (entry)=>String(entry.agenda_item_id)===String(row.id),
    ).length;
    return !row.vote_method ||
      !row.decision_outcome ||
      eligible==null ||
      eligible!==voteTotal ||
      Number(row.excluded_voters ?? 0)!==exclusionCount ||
      (row.vote_method==="roll_call" && !String(row.vote_details ?? "").trim());
  }).length;
  const spontaneousWithoutBasisCount=agenda.filter(
    (row)=>row.resolution_number &&
      row.announced_with_invitation===false &&
      !String(row.decision_basis_note ?? "").trim(),
  ).length;
  const protocolReady=
    formalReady &&
    chairPresent &&
    minuteTakerPresent &&
    unresolvedAttendeeCount===0 &&
    unresolvedGuestCount===0 &&
    unfinishedAgendaCount===0 &&
    decisionWithoutResolutionCount===0 &&
    invalidVoteCount===0 &&
    spontaneousWithoutBasisCount===0 &&
    (resolutionCount===0 || meeting.quorum_confirmed===true);
  const protocolIssues=[
    !formalReady ? "Formalia zu Einladung, Rollen oder Beschlussfähigkeit vervollständigen." : null,
    !chairPresent || !minuteTakerPresent ? "Sitzungsleitung und Protokollführung müssen als anwesend dokumentiert sein." : null,
    unresolvedAttendeeCount>0 ? `${unresolvedAttendeeCount} Teilnehmerstatus noch ungeklärt.` : null,
    unresolvedGuestCount>0 ? `${unresolvedGuestCount} Gaststatus noch ungeklärt.` : null,
    unfinishedAgendaCount>0 ? `${unfinishedAgendaCount} TOP(s) noch nicht erledigt oder vertagt.` : null,
    decisionWithoutResolutionCount>0 ? `${decisionWithoutResolutionCount} Beschluss-TOP(s) ohne dokumentierte Abstimmung.` : null,
    invalidVoteCount>0 ? `${invalidVoteCount} Abstimmung(en) formal unvollständig.` : null,
    spontaneousWithoutBasisCount>0 ? `${spontaneousWithoutBasisCount} spontaner Beschluss-TOP ohne Begründung.` : null,
    resolutionCount>0 && meeting.quorum_confirmed!==true ? "Beschlüsse benötigen bestätigte Beschlussfähigkeit." : null,
  ].filter((item):item is string=>Boolean(item));

  return (
    <main className="minutes-page secretary-workspace-page minutes-page-v2">
      <div className="secretary-workspace no-print">
        <section className="secretary-workspace-head">
          <div>
            <Link href={`/sitzungen/${id}`} className="back-link">← Sitzung</Link>
            <span className="eyebrow">Sitzungsprotokoll</span>
            <h1>Protokoll prüfen</h1>
            <p>{String(meeting.title)} · Version {Number(meeting.minutes_version ?? 1)}</p>
          </div>
          <div className="secretary-workspace-actions">
            <span className={"minutes-status minutes-"+minutesStatus}>
              {minutesStatusLabels[minutesStatus] ?? minutesStatus}
            </span>
            <a href="#protokoll-vorschau" className="ghost-button">Protokoll ansehen</a>
          </div>
        </section>

        {query.error && <div className="form-error">{errors[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
        {query.completed && <div className="form-success">Sitzung beendet. Das Protokoll ist automatisch vorbereitet und kann jetzt geprüft werden.</div>}
        {query.saved && <div className="form-success">Protokolltext wurde gespeichert.</div>}
        {query.submitted && <div className="form-success">Das Protokoll wurde zur Prüfung eingereicht.</div>}
        {query.returned && <div className="form-success">Das Protokoll wurde zur Überarbeitung zurückgegeben.</div>}
        {query.approved && <div className="form-success">Das Protokoll wurde freigegeben.</div>}
        {query.archived && <div className="form-success">Das Protokoll wurde archiviert.</div>}

        <section className="minutes-workflow">
          {[
            ["draft","1","Entwurf","Nachbearbeitung & Kontrolle"],
            ["review","2","Prüfung","Vorsitz prüft"],
            ["archived","3","Freigegeben","automatisch archiviert"],
          ].map(([key,number,label,sub])=>{
            const order=["draft","review","archived"];
            const workflowStatus=minutesStatus==="approved" ? "archived" : minutesStatus;
            const activeIndex=order.indexOf(workflowStatus);
            const itemIndex=order.indexOf(key);
            return (
              <div className={"minutes-workflow-step "+(itemIndex<activeIndex ? "is-done" : itemIndex===activeIndex ? "is-current" : "")} key={key}>
                <b>{number}</b>
                <div><strong>{label}</strong><span>{sub}</span></div>
              </div>
            );
          })}
        </section>

        {meeting.minutes_return_note && minutesStatus==="draft" && (
          <article className="minutes-return-note">
            <span className="eyebrow">Zur Überarbeitung zurückgegeben</span>
            <strong>{String(meeting.minutes_return_note)}</strong>
          </article>
        )}

        <section className="secretary-meta-grid">
          <article>
            <span>Sitzungsleitung</span>
            <strong>
              {meeting.chair_first_name
                ? String(meeting.chair_first_name)+" "+String(meeting.chair_last_name)
                : "Noch nicht festgelegt"}
            </strong>
          </article>
          <article>
            <span>Protokollführung</span>
            <strong>
              {meeting.minute_taker_first_name
                ? String(meeting.minute_taker_first_name)+" "+String(meeting.minute_taker_last_name)
                : "Noch nicht festgelegt"}
            </strong>
          </article>
          <article>
            <span>Sitzung</span>
            <strong>{meetingStatusLabel(meeting.status)}</strong>
          </article>
          <article>
            <span>Version</span>
            <strong>v{Number(meeting.minutes_version ?? 1)}</strong>
          </article>
        </section>

        <section className="minutes-quality-strip">
          <article className={formalReady ? "is-ready" : "needs-attention"}>
            <span>Formalia</span>
            <strong>{formalReady ? "Vollständig" : "Prüfen"}</strong>
            <small>Einladung, Rollen, Beschlussfähigkeit</small>
          </article>
          <article>
            <span>Teilnahme</span>
            <strong>{present.length}</strong>
            <small>{votingPresent.length} stimmberechtigt · {presentGuests.length} Gäste</small>
          </article>
          <article>
            <span>TOPs</span>
            <strong>{agenda.length}</strong>
            <small>{deferredCount} vertagt</small>
          </article>
          <article>
            <span>Beschlüsse</span>
            <strong>{resolutionCount}</strong>
            <small>{attachments.length} Anlagen</small>
          </article>
        </section>

        {minutesStatus==="draft" && (
          <div className="minutes-readiness">
            {protocolReady ? (
              <span>✓ Vollständig geprüft: Das Protokoll kann zur Freigabe eingereicht werden.</span>
            ) : (
              <div>
                <strong>Vor der Einreichung noch prüfen:</strong>
                {protocolIssues.map((issue)=><span key={issue}>⚠ {issue}</span>)}
              </div>
            )}
            {!protocolReady && canWrite && (
              <Link href={`/sitzungen/${id}/korrektur`} className="mini-button">Nachbearbeitung öffnen</Link>
            )}
          </div>
        )}

        {canWrite && minutesStatus==="draft" && (
          <section className="minutes-correction-entry">
            <div>
              <span className="eyebrow">Nachbearbeitung</span>
              <strong>Etwas aus der Sitzung korrigieren?</strong>
              <small>
                Formalia, Teilnahme, Gäste, TOP-Ergebnisse, Beschlüsse, Zeiten sowie Einleitung und Abschluss können vor der Einreichung korrigiert werden. Jede Änderung wird protokolliert.
              </small>
            </div>
            <Link href={`/sitzungen/${id}/korrektur`} className="ghost-button">
              Nachbearbeiten
            </Link>
          </section>
        )}

        <section className="secretary-approval-panel">
          {canWrite && minutesStatus==="draft" && (
            <article className="panel">
              <span className="eyebrow">Schritt 2</span>
              <h2>Zur Prüfung einreichen</h2>
              <p>Nach der Einreichung ist der Entwurf gesperrt, bis er freigegeben oder zur Korrektur zurückgegeben wird.</p>
              {protocolReady ? (
                <form action={submitMeetingMinutesAction}>
                  <input type="hidden" name="meetingId" value={id} />
                  <ConfirmSubmitButton
                    message="Protokoll jetzt zur Prüfung einreichen? Der Entwurf wird bis zur Entscheidung gesperrt."
                    className="primary-button"
                  >
                    Zur Prüfung einreichen
                  </ConfirmSubmitButton>
                </form>
              ) : (
                <div className="minutes-review-actions">
                  <button className="primary-button" type="button" disabled>Zur Prüfung einreichen</button>
                  <Link href={`/sitzungen/${id}/korrektur`} className="ghost-button">Fehlende Angaben bearbeiten</Link>
                </div>
              )}
            </article>
          )}

          {minutesStatus==="review" && (
            <article className="panel minutes-review-panel">
              <div className="minutes-review-head">
                <div>
                  <span className="eyebrow">Prüfung</span>
                  <h2>Protokoll zur Freigabe</h2>
                  <p>
                    Eingereicht {meeting.minutes_submitted_at ? formatShortDateTime(meeting.minutes_submitted_at) : ""}
                    {meeting.submitted_by_name ? " von "+String(meeting.submitted_by_name) : ""}.
                  </p>
                </div>
                <span className="minutes-status minutes-review">In Prüfung</span>
              </div>

              <div className="minutes-review-checklist">
                <div><span>Formalia</span><strong>✓ Vollständig</strong></div>
                <div><span>Teilnahme</span><strong>{present.length} anwesend</strong></div>
                <div><span>TOPs</span><strong>{agenda.length} geprüft</strong></div>
                <div><span>Beschlüsse</span><strong>{resolutionCount}</strong></div>
                <div><span>Anlagen</span><strong>{attachments.length}</strong></div>
              </div>

              <a href="#protokoll-vorschau" className="ghost-button minutes-review-preview">
                Finale Fassung ansehen
              </a>

              {canApprove ? (
                <div className="minutes-review-decision">
                  <div className="minutes-review-primary">
                    <div>
                      <strong>Alles korrekt?</strong>
                      <span>Mit der Freigabe wird diese Version automatisch archiviert und für weitere Änderungen gesperrt.</span>
                    </div>
                    <form action={approveMeetingMinutesAction}>
                      <input type="hidden" name="meetingId" value={id} />
                      <ConfirmSubmitButton
                        message="Protokoll als geprüft freigeben und automatisch archivieren?"
                        className="primary-button"
                      >
                        Freigeben & archivieren
                      </ConfirmSubmitButton>
                    </form>
                  </div>

                  <details className="minutes-return-drawer">
                    <summary>
                      <div>
                        <strong>Korrektur erforderlich?</strong>
                        <span>Protokoll an die Protokollführung zurückgeben</span>
                      </div>
                      <b>+</b>
                    </summary>
                    <form action={returnMeetingMinutesAction} className="form-stack">
                      <input type="hidden" name="meetingId" value={id} />
                      <label>
                        Rückgabegrund
                        <textarea
                          name="returnNote"
                          rows={3}
                          required
                          placeholder="Was soll konkret korrigiert werden?"
                        />
                      </label>
                      <button className="ghost-button">Zur Überarbeitung zurückgeben</button>
                    </form>
                  </details>
                </div>
              ) : (
                <div className="minutes-waiting">
                  Das Protokoll wartet auf Freigabe durch eine berechtigte Vorstandsrolle.
                </div>
              )}
            </article>
          )}

          {minutesStatus==="archived" && (
            <article className="panel minutes-archive-complete">
              <div>
                <span className="eyebrow">Abgeschlossen</span>
                <h2>Freigegeben & archiviert</h2>
                <p>
                  Archiviert {meeting.minutes_archived_at ? formatShortDateTime(meeting.minutes_archived_at) : ""}
                  {meeting.archived_by_name ? " von "+String(meeting.archived_by_name) : ""}.
                </p>
              </div>
              <div className="minutes-archive-actions">
                <a href="#protokoll-vorschau" className="primary-button">Protokoll ansehen</a>
                <Link href="/archiv" className="ghost-button">Archiv öffnen</Link>
              </div>
            </article>
          )}

          <details className="panel minutes-history-panel">
            <summary>
              <div><span className="eyebrow">Historie</span><strong>Protokollverlauf</strong></div>
              <b>{revisions.length}</b>
            </summary>
            <div className="minutes-history-content">
            {revisions.length===0 ? (
              <div className="empty-state">Noch keine Freigabeversion vorhanden.</div>
            ) : (
              <div className="minutes-history-list">
                {revisions.map((revision)=>(
                  <div key={String(revision.version)+"-"+String(revision.created_at)}>
                    <b>v{Number(revision.version)}</b>
                    <div>
                      <strong>{minutesStatusLabels[String(revision.status)] ?? String(revision.status)}</strong>
                      <span>
                        {formatShortDateTime(revision.created_at)}
                        {revision.changed_by_name ? " · "+String(revision.changed_by_name) : ""}
                      </span>
                      {revision.change_note && <small>{String(revision.change_note)}</small>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </details>
        </section>
      </div>

      <details className="minutes-preview-drawer" id="protokoll-vorschau">
        <summary className="no-print">
          <div>
            <span className="eyebrow">Vorschau</span>
            <strong>Fertiges Protokoll ansehen</strong>
            <small>Die Druckfassung wird vollständig aus den Sitzungsdaten aufgebaut.</small>
          </div>
          <b>+</b>
        </summary>
      <div className="minutes-toolbar no-print">
        <Link href={`/sitzungen/${id}`} className="ghost-button">← Sitzung</Link>
        <span>Finale Druckansicht · im Browser „Drucken“ → „Als PDF sichern“.</span>
      </div>

      <article className="minutes-document">
        {minutesStatus!=="archived" && (
          <div className="minutes-draft-watermark">
            {minutesStatus==="review" ? "IN PRÜFUNG" : "ENTWURF"}
          </div>
        )}

        <header className="minutes-header">
          <div className="minutes-brand">VDC</div>
          <div>
            <span>Vestischer Darts Club</span>
            <h1>Sitzungsprotokoll</h1>
            <p>{String(meeting.title)}</p>
          </div>
        </header>

        <section className="minutes-meta">
          <div><span>Beginn</span><strong>{formatDateTime(meeting.opened_at ?? meeting.starts_at)}</strong></div>
          <div><span>Ende</span><strong>{meeting.ended_at ? formatDateTime(meeting.ended_at) : "Noch nicht beendet"}</strong></div>
          <div><span>Ort</span><strong>{meeting.location ? String(meeting.location) : "–"}</strong></div>
          <div><span>Status</span><strong>{minutesStatusLabels[minutesStatus] ?? minutesStatus}</strong></div>
        </section>

        <section className="minutes-meta minutes-officer-meta">
          <div>
            <span>Sitzungsleitung</span>
            <strong>
              {meeting.chair_first_name
                ? String(meeting.chair_first_name)+" "+String(meeting.chair_last_name)
                : "–"}
            </strong>
          </div>
          <div>
            <span>Protokollführung</span>
            <strong>
              {meeting.minute_taker_first_name
                ? String(meeting.minute_taker_first_name)+" "+String(meeting.minute_taker_last_name)
                : "–"}
            </strong>
          </div>
        </section>

        <section className="minutes-section minutes-formalities">
          <h2>Formale Feststellungen</h2>
          <div className="minutes-formality-grid">
            <div><span>Sitzungsart</span><strong>{meetingModeLabels[String(meeting.meeting_mode)] ?? String(meeting.meeting_mode)}</strong></div>
            <div><span>Einladung versendet</span><strong>{meeting.invited_at ? formatShortDateTime(meeting.invited_at) : "–"}</strong></div>
            <div><span>Einladungsweg</span><strong>{meeting.invitation_method ? String(meeting.invitation_method) : "–"}</strong></div>
            <div><span>Fristgerecht</span><strong>{meeting.invitation_timely===true ? "Ja" : meeting.invitation_timely===false ? "Nein / Abweichung" : "Nicht dokumentiert"}</strong></div>
            <div><span>Tagesordnung mit Einladung</span><strong>{meeting.agenda_sent_with_invitation===true ? "Ja" : meeting.agenda_sent_with_invitation===false ? "Nein / Abweichung" : "Nicht dokumentiert"}</strong></div>
            <div><span>Beschlussfähigkeit</span><strong>{meeting.quorum_confirmed===true ? "Festgestellt" : meeting.quorum_confirmed===false ? "Nicht gegeben" : "Nicht dokumentiert"}</strong></div>
            <div><span>Anwesend</span><strong>{present.length}</strong></div>
            <div><span>Stimmberechtigt anwesend</span><strong>{votingPresent.length}</strong></div>
          </div>
          {meeting.quorum_basis && <p><strong>Grundlage:</strong> {String(meeting.quorum_basis)}</p>}
          {meeting.quorum_note && <p><strong>Beschlussfähigkeit:</strong> {String(meeting.quorum_note)}</p>}
          {meeting.formalities_note && <p><strong>Besonderheiten:</strong> {String(meeting.formalities_note)}</p>}
        </section>

        <section className="minutes-section">
          <h2>Teilnehmer</h2>
          <div className="minutes-attendance-grid">
            <div>
              <h3>Anwesend</h3>
              {present.length === 0 ? <p>–</p> : present.map((row) => (
                <p key={`${row.first_name}-${row.last_name}`}>
                  {String(row.first_name)} {String(row.last_name)}
                  {row.voting_eligible===false ? " · nicht stimmberechtigt" : ""}
                </p>
              ))}
            </div>
            <div>
              <h3>Entschuldigt</h3>
              {excused.length === 0 ? <p>–</p> : excused.map((row) => (
                <p key={`${row.first_name}-${row.last_name}`}>{String(row.first_name)} {String(row.last_name)}</p>
              ))}
            </div>
            <div>
              <h3>Abwesend / offen</h3>
              {absent.length === 0 ? <p>–</p> : absent.map((row) => (
                <p key={`${row.first_name}-${row.last_name}`}>{String(row.first_name)} {String(row.last_name)}</p>
              ))}
            </div>
          </div>
        </section>

        {presentGuests.length>0 && (
          <section className="minutes-section">
            <h2>Gäste</h2>
            <div className="minutes-guest-list">
              {presentGuests.map((guest)=>(
                <p key={String(guest.id)}>
                  <strong>{String(guest.name)}</strong>
                  {guest.organization ? " · "+String(guest.organization) : ""}
                  {guest.note ? " · "+String(guest.note) : ""}
                </p>
              ))}
            </div>
          </section>
        )}

        {meeting.minutes_intro && (
          <section className="minutes-section">
            <h2>Allgemeine Feststellungen</h2>
            <p>{String(meeting.minutes_intro)}</p>
          </section>
        )}

        {meeting.notes && (
          <section className="minutes-section">
            <h2>Vorbereitende Notiz</h2>
            <p>{String(meeting.notes)}</p>
          </section>
        )}

        <section className="minutes-section">
          <h2>Tagesordnung & Ergebnisse</h2>
          <div className="minutes-agenda">
            {agenda.length === 0 ? (
              <p>Keine Tagesordnungspunkte hinterlegt.</p>
            ) : agenda.map((item) => (
              <section className="minutes-top" key={String(item.position)}>
                <div className="minutes-top-title">
                  <span>TOP {String(item.position).padStart(2, "0")}</span>
                  <h3>{String(item.title)}</h3>
                  <b className="minutes-agenda-type">
                    {agendaTypeLabels[String(item.agenda_type)] ?? "Beratung"}
                  </b>
                  {!item.announced_with_invitation && <b className="minutes-spontaneous">nachträglich ergänzt</b>}
                </div>
                {item.description && <p>{String(item.description)}</p>}
                {item.notes && <p><strong>Ergebnis:</strong> {String(item.notes)}</p>}
                {!item.announced_with_invitation && item.decision_basis_note && (
                  <p><strong>Formale Begründung:</strong> {String(item.decision_basis_note)}</p>
                )}

                {exclusions.filter((entry)=>String(entry.agenda_item_id)===String(item.id)).length>0 && (
                  <div className="minutes-exclusions">
                    <strong>Von Beratung/Abstimmung ausgeschlossen:</strong>
                    {exclusions
                      .filter((entry)=>String(entry.agenda_item_id)===String(item.id))
                      .map((entry)=>(
                        <span key={String(entry.id)}>
                          {String(entry.person_name)} · {String(entry.reason)}
                        </span>
                      ))}
                  </div>
                )}

                {item.resolution_number && (
                  <div className="minutes-resolution">
                    <div className="minutes-resolution-head">
                      <strong>Beschluss {String(item.resolution_number)}</strong>
                      <span>{outcomeLabels[String(item.decision_outcome)] ?? String(item.resolution_status)}</span>
                    </div>
                    <h4>{String(item.resolution_title)}</h4>
                    <p>{String(item.decision_text)}</p>
                    <p className="minutes-vote">
                      Abstimmung: {voteMethodLabels[String(item.vote_method)] ?? "–"} ·
                      {" "}{Number(item.eligible_voters ?? 0)} stimmberechtigt ·
                      {" "}{Number(item.excluded_voters ?? 0)} ausgeschlossen ·
                      {" "}{Number(item.votes_yes)} Ja · {Number(item.votes_no)} Nein · {Number(item.votes_abstain)} Enthaltung ·
                      {" "}<strong>{outcomeLabels[String(item.decision_outcome)] ?? "Ergebnis offen"}</strong>
                    </p>
                    {item.vote_details && (
                      <p><strong>Namentliche Abstimmung:</strong> {String(item.vote_details)}</p>
                    )}
                    {item.task_title && (
                      <div className="minutes-task">
                        <strong>Folgeaufgabe:</strong> {String(item.task_title)}
                        {item.owner_first_name ? ` · ${item.owner_first_name} ${item.owner_last_name}` : ""}
                        {item.due_date
                          ? ` · Frist ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin" }).format(new Date(String(item.due_date)))}`
                          : ""}
                        {item.task_status ? ` · ${item.task_status}` : ""}
                      </div>
                    )}
                  </div>
                )}

                {attachments.filter((doc)=>String(doc.agenda_item_id)===String(item.id)).length>0 && (
                  <div className="minutes-attachments">
                    <strong>Anlagen zu diesem TOP:</strong>
                    {attachments
                      .filter((doc)=>String(doc.agenda_item_id)===String(item.id))
                      .map((doc,index)=>(
                        <span key={String(doc.id)}>
                          Anlage {attachments.findIndex((candidate)=>String(candidate.id)===String(doc.id))+1}: {String(doc.title)}
                          {doc.original_filename ? " ("+String(doc.original_filename)+")" : ""}
                        </span>
                      ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </section>

        {generalAttachments.length>0 && (
          <section className="minutes-section">
            <h2>Allgemeine Sitzungsanlagen</h2>
            <div className="minutes-attachments">
              {generalAttachments.map((doc,index)=>(
                <span key={String(doc.id)}>
                  Anlage {index+1}: {String(doc.title)}
                  {doc.original_filename ? " ("+String(doc.original_filename)+")" : ""}
                </span>
              ))}
            </div>
          </section>
        )}

        {meeting.minutes_closing && (
          <section className="minutes-section">
            <h2>Abschluss</h2>
            <p>{String(meeting.minutes_closing)}</p>
          </section>
        )}

        {meeting.next_meeting_at && (
          <section className="minutes-section">
            <h2>Nächster Sitzungstermin</h2>
            <p>{formatDateTime(meeting.next_meeting_at)}</p>
          </section>
        )}

        <footer className="minutes-signatures">
          <div>
            <span>____________________________</span>
            <strong>
              {meeting.chair_first_name
                ? String(meeting.chair_first_name)+" "+String(meeting.chair_last_name)
                : "Sitzungsleitung"}
            </strong>
            <small>Sitzungsleitung</small>
          </div>
          <div>
            <span>____________________________</span>
            <strong>
              {meeting.minute_taker_first_name
                ? String(meeting.minute_taker_first_name)+" "+String(meeting.minute_taker_last_name)
                : "Protokollführung"}
            </strong>
            <small>Protokollführung</small>
          </div>
        </footer>
      </article>
      </details>
    </main>
  );
}
