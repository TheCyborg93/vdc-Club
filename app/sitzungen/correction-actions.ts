"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

function value(formData:FormData,key:string) {
  return String(formData.get(key) ?? "").trim();
}

function json(value:unknown) {
  return JSON.stringify(value ?? null);
}

async function ensureEditableMeeting(sql:any,meetingId:string) {
  const rows=await sql`
    SELECT id::text,title,status,minutes_status,event_id::text
    FROM meetings
    WHERE id=${meetingId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const meeting=rows[0];
  if (!meeting || String(meeting.status)!=="completed" || String(meeting.minutes_status)!=="draft") {
    return null;
  }
  return meeting;
}

export async function correctCompletedMeetingAction(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const reason=value(formData,"reason");
  const title=value(formData,"title");
  const startsAt=value(formData,"startsAt");
  const openedAt=value(formData,"openedAt");
  const endedAt=value(formData,"endedAt");
  const location=value(formData,"location");
  const meetingModeRaw=value(formData,"meetingMode");
  const meetingMode=["in_person","hybrid","online"].includes(meetingModeRaw) ? meetingModeRaw : "in_person";
  const invitedAt=value(formData,"invitedAt");
  const invitationMethod=value(formData,"invitationMethod");
  const invitationTimely=value(formData,"invitationTimely")==="yes";
  const agendaSentWithInvitation=value(formData,"agendaSentWithInvitation")==="yes";
  const quorumConfirmed=value(formData,"quorumConfirmed")==="yes";
  const quorumBasis=value(formData,"quorumBasis");
  const quorumNote=value(formData,"quorumNote");
  const formalitiesNote=value(formData,"formalitiesNote");
  const minutesIntro=value(formData,"minutesIntro");
  const minutesClosing=value(formData,"minutesClosing");

  if (!meetingId || !reason || !title || !startsAt || !openedAt || !endedAt || !invitedAt || !invitationMethod) {
    redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);
  }

  const allowed=await ensureEditableMeeting(sql,meetingId);
  if (!allowed) redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);

  const beforeRows=await sql`
    SELECT
      title,starts_at,opened_at,ended_at,location,meeting_mode,
      invited_at,invitation_method,invitation_timely,agenda_sent_with_invitation,
      quorum_confirmed,quorum_basis,quorum_note,formalities_note,
      minutes_intro,minutes_closing
    FROM meetings
    WHERE id=${meetingId}::uuid
    LIMIT 1
  `;
  const before=beforeRows[0];

  const rows=await sql`
    UPDATE meetings
    SET
      title=${title},
      starts_at=(${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
      opened_at=(${openedAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
      ended_at=(${endedAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
      location=${location || null},
      meeting_mode=${meetingMode},
      invited_at=(${invitedAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
      invitation_method=${invitationMethod},
      invitation_timely=${invitationTimely},
      agenda_sent_with_invitation=${agendaSentWithInvitation},
      quorum_confirmed=${quorumConfirmed},
      quorum_basis=${quorumBasis || null},
      quorum_note=${quorumNote || null},
      formalities_note=${formalitiesNote || null},
      minutes_intro=${minutesIntro || null},
      minutes_closing=${minutesClosing || null},
      updated_at=now()
    WHERE id=${meetingId}::uuid
      AND status='completed'
      AND minutes_status='draft'
    RETURNING
      title,starts_at,opened_at,ended_at,location,meeting_mode,
      invited_at,invitation_method,invitation_timely,agenda_sent_with_invitation,
      quorum_confirmed,quorum_basis,quorum_note,formalities_note,
      minutes_intro,minutes_closing,event_id::text
  `;
  const after=rows[0];
  if (!after) redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);

  await sql`
    INSERT INTO meeting_change_log(
      meeting_id,entity_type,entity_id,action,before_data,after_data,reason,changed_by
    )
    VALUES(
      ${meetingId}::uuid,'meeting',${meetingId}::uuid,'correction',
      ${json(before)}::jsonb,${json(after)}::jsonb,${reason},${actor.id}::uuid
    )
  `;

  if (after.event_id) {
    await sql`
      UPDATE club_events
      SET
        title=${title},
        starts_at=(${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
        location=${location || null},
        updated_at=now()
      WHERE id=${String(after.event_id)}::uuid
        AND deleted_at IS NULL
    `;
  }

  await writeAudit(actor.id,"meeting.corrected","meeting",meetingId,{reason});
  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath(`/sitzungen/${meetingId}/korrektur`);
  revalidatePath("/kalender");
  redirect(`/sitzungen/${meetingId}/korrektur?saved=meeting`);
}

export async function correctMeetingAttendeeAction(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const memberId=value(formData,"memberId");
  const reason=value(formData,"reason");
  const attendanceRaw=value(formData,"attendance");
  const attendance=["present","absent","excused"].includes(attendanceRaw) ? attendanceRaw : "absent";
  const votingEligible=value(formData,"votingEligible")==="true";
  if (!meetingId || !memberId || !reason) redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);

  if (!await ensureEditableMeeting(sql,meetingId)) {
    redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);
  }

  const beforeRows=await sql`
    SELECT attendance,voting_eligible
    FROM meeting_attendees
    WHERE meeting_id=${meetingId}::uuid
      AND member_id=${memberId}::uuid
    LIMIT 1
  `;
  const before=beforeRows[0];

  const rows=await sql`
    UPDATE meeting_attendees
    SET attendance=${attendance},voting_eligible=${votingEligible}
    WHERE meeting_id=${meetingId}::uuid
      AND member_id=${memberId}::uuid
    RETURNING attendance,voting_eligible
  `;
  const after=rows[0];
  if (!after) redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);

  await sql`
    INSERT INTO meeting_change_log(
      meeting_id,entity_type,entity_id,action,before_data,after_data,reason,changed_by
    )
    VALUES(
      ${meetingId}::uuid,'attendee',${memberId}::uuid,'correction',
      ${json(before)}::jsonb,${json(after)}::jsonb,${reason},${actor.id}::uuid
    )
  `;

  await writeAudit(actor.id,"meeting.attendee_corrected","meeting",meetingId,{memberId,reason});
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath(`/sitzungen/${meetingId}/korrektur`);
  redirect(`/sitzungen/${meetingId}/korrektur?saved=attendee`);
}

export async function correctMeetingGuestAction(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const guestId=value(formData,"guestId");
  const reason=value(formData,"reason");
  const name=value(formData,"name");
  const organization=value(formData,"organization");
  const note=value(formData,"note");
  const attendanceRaw=value(formData,"attendance");
  const attendance=["present","absent"].includes(attendanceRaw) ? attendanceRaw : "absent";
  if (!meetingId || !guestId || !reason || !name) redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);

  if (!await ensureEditableMeeting(sql,meetingId)) {
    redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);
  }

  const beforeRows=await sql`
    SELECT name,organization,note,attendance
    FROM meeting_guests
    WHERE id=${guestId}::uuid AND meeting_id=${meetingId}::uuid
    LIMIT 1
  `;
  const before=beforeRows[0];

  const rows=await sql`
    UPDATE meeting_guests
    SET
      name=${name},
      organization=${organization || null},
      note=${note || null},
      attendance=${attendance}
    WHERE id=${guestId}::uuid
      AND meeting_id=${meetingId}::uuid
    RETURNING name,organization,note,attendance
  `;
  const after=rows[0];
  if (!after) redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);

  await sql`
    INSERT INTO meeting_change_log(
      meeting_id,entity_type,entity_id,action,before_data,after_data,reason,changed_by
    )
    VALUES(
      ${meetingId}::uuid,'guest',${guestId}::uuid,'correction',
      ${json(before)}::jsonb,${json(after)}::jsonb,${reason},${actor.id}::uuid
    )
  `;

  await writeAudit(actor.id,"meeting.guest_corrected","meeting",meetingId,{guestId,reason});
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath(`/sitzungen/${meetingId}/korrektur`);
  redirect(`/sitzungen/${meetingId}/korrektur?saved=guest`);
}

export async function correctAgendaItemAction(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const reason=value(formData,"reason");
  const title=value(formData,"title");
  const description=value(formData,"description");
  const notes=value(formData,"notes");
  const typeRaw=value(formData,"agendaType");
  const agendaType=["information","consultation","decision"].includes(typeRaw) ? typeRaw : "consultation";
  const statusRaw=value(formData,"status");
  const status=["done","deferred"].includes(statusRaw) ? statusRaw : "done";
  const announced=value(formData,"announcedWithInvitation")==="true";
  const basis=value(formData,"decisionBasisNote");
  if (!meetingId || !agendaItemId || !reason || !title) redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);

  if (!await ensureEditableMeeting(sql,meetingId)) {
    redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);
  }

  const beforeRows=await sql`
    SELECT title,description,notes,agenda_type,status,announced_with_invitation,decision_basis_note
    FROM agenda_items
    WHERE id=${agendaItemId}::uuid
      AND meeting_id=${meetingId}::uuid
    LIMIT 1
  `;
  const before=beforeRows[0];

  const rows=await sql`
    UPDATE agenda_items
    SET
      title=${title},
      description=${description || null},
      notes=${notes || null},
      agenda_type=${agendaType},
      status=${status},
      announced_with_invitation=${announced},
      decision_basis_note=${basis || null},
      result_code=CASE WHEN ${status}='deferred' THEN 'deferred' ELSE 'completed' END,
      completed_at=COALESCE(completed_at,now()),
      updated_at=now()
    WHERE id=${agendaItemId}::uuid
      AND meeting_id=${meetingId}::uuid
    RETURNING title,description,notes,agenda_type,status,announced_with_invitation,decision_basis_note
  `;
  const after=rows[0];
  if (!after) redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);

  await sql`
    INSERT INTO meeting_change_log(
      meeting_id,entity_type,entity_id,action,before_data,after_data,reason,changed_by
    )
    VALUES(
      ${meetingId}::uuid,'agenda_item',${agendaItemId}::uuid,'correction',
      ${json(before)}::jsonb,${json(after)}::jsonb,${reason},${actor.id}::uuid
    )
  `;

  await writeAudit(actor.id,"agenda.corrected","agenda_item",agendaItemId,{meetingId,reason});
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath(`/sitzungen/${meetingId}/korrektur`);
  redirect(`/sitzungen/${meetingId}/korrektur?saved=agenda`);
}

export async function correctResolutionAction(formData:FormData) {
  const actor=await requirePermission("resolutions.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const resolutionId=value(formData,"resolutionId");
  const reason=value(formData,"reason");
  const title=value(formData,"title");
  const decisionText=value(formData,"decisionText");
  const voteMethodRaw=value(formData,"voteMethod");
  const voteMethod=["open","show_of_hands","roll_call","secret","electronic"].includes(voteMethodRaw)
    ? voteMethodRaw
    : "show_of_hands";
  const voteDetails=value(formData,"voteDetails");
  const eligible=Number(value(formData,"eligibleVoters") || "0");
  const excluded=Number(value(formData,"excludedVoters") || "0");
  const yes=Number(value(formData,"votesYes") || "0");
  const no=Number(value(formData,"votesNo") || "0");
  const abstain=Number(value(formData,"votesAbstain") || "0");
  const outcomeRaw=value(formData,"decisionOutcome");
  const outcome=["accepted","rejected"].includes(outcomeRaw) ? outcomeRaw : "";
  if (!meetingId || !resolutionId || !reason || !title || !decisionText || !outcome) {
    redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);
  }
  if ([eligible,excluded,yes,no,abstain].some((number)=>!Number.isFinite(number) || number<0)) {
    redirect(`/sitzungen/${meetingId}/korrektur?error=votes`);
  }
  if (yes+no+abstain!==eligible) {
    redirect(`/sitzungen/${meetingId}/korrektur?error=votes`);
  }
  if (voteMethod==="roll_call" && !voteDetails) {
    redirect(`/sitzungen/${meetingId}/korrektur?error=rollcall`);
  }

  if (!await ensureEditableMeeting(sql,meetingId)) {
    redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);
  }

  const beforeRows=await sql`
    SELECT
      title,decision_text,vote_method,vote_details,eligible_voters,excluded_voters,
      votes_yes,votes_no,votes_abstain,decision_outcome,status
    FROM resolutions
    WHERE id=${resolutionId}::uuid
      AND meeting_id=${meetingId}::uuid
    LIMIT 1
  `;
  const before=beforeRows[0];

  const rows=await sql`
    UPDATE resolutions
    SET
      title=${title},
      decision_text=${decisionText},
      vote_method=${voteMethod},
      vote_details=${voteDetails || null},
      eligible_voters=${eligible},
      excluded_voters=${excluded},
      votes_yes=${yes},
      votes_no=${no},
      votes_abstain=${abstain},
      decision_outcome=${outcome},
      status=CASE WHEN ${outcome}='accepted' THEN
        CASE WHEN status='withdrawn' THEN 'open' ELSE status END
        ELSE 'withdrawn'
      END
    WHERE id=${resolutionId}::uuid
      AND meeting_id=${meetingId}::uuid
    RETURNING
      title,decision_text,vote_method,vote_details,eligible_voters,excluded_voters,
      votes_yes,votes_no,votes_abstain,decision_outcome,status
  `;
  const after=rows[0];
  if (!after) redirect(`/sitzungen/${meetingId}/korrektur?error=missing`);

  await sql`
    INSERT INTO meeting_change_log(
      meeting_id,entity_type,entity_id,action,before_data,after_data,reason,changed_by
    )
    VALUES(
      ${meetingId}::uuid,'resolution',${resolutionId}::uuid,'correction',
      ${json(before)}::jsonb,${json(after)}::jsonb,${reason},${actor.id}::uuid
    )
  `;

  await writeAudit(actor.id,"resolution.corrected","resolution",resolutionId,{meetingId,reason});
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath(`/sitzungen/${meetingId}/korrektur`);
  revalidatePath("/beschluesse");
  redirect(`/sitzungen/${meetingId}/korrektur?saved=resolution`);
}
