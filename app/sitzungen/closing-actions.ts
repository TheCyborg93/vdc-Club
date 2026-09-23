"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import { meetingV3CanApproveMinutes } from "@/lib/meeting-v3";

function value(formData:FormData,key:string){
  return String(formData.get(key) ?? "").trim();
}

function meetingPath(meetingId:string,suffix="",query?:string){
  return `/sitzungen/${meetingId}${suffix}${query ? `?${query}` : ""}`;
}

async function writeMeetingV3Audit(
  meetingId:string,
  actorUserId:string,
  action:string,
  entityType:string,
  entityId:string|null,
  afterData:Record<string,unknown>={},
  reason?:string,
){
  const sql=getDb();
  if(!sql) return;
  await sql`
    INSERT INTO meeting_v3_audit_log (
      meeting_id,actor_user_id,action,entity_type,entity_id,after_data,reason
    )
    VALUES (
      ${meetingId}::uuid,${actorUserId}::uuid,${action},${entityType},
      ${entityId || null}::uuid,${JSON.stringify(afterData)}::jsonb,${reason || null}
    )
  `;
}

export async function beginMeetingV3ClosingAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  if(!meetingId) redirect("/sitzungen?error=missing");

  const rows=await sql`
    UPDATE meeting_v3_meetings m
    SET
      lifecycle_state='closing',
      ended_at=COALESCE(ended_at,now()),
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='live'
      AND NOT EXISTS (
        SELECT 1 FROM meeting_v3_agenda_items ai
        WHERE ai.meeting_id=m.id AND ai.status IN ('open','active')
      )
    RETURNING m.id::text,m.ended_at
  `;

  if(!rows.length) redirect(meetingPath(meetingId,"/live","error=closing_not_ready"));

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.closing_started","meeting",meetingId,{
    endedAt:rows[0].ended_at,
  });

  revalidatePath(meetingPath(meetingId,"/live"));
  revalidatePath(meetingPath(meetingId,"/close"));
  revalidatePath("/sitzungen");
  redirect(meetingPath(meetingId,"/close"));
}

export async function returnMeetingV3ToLiveAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const rows=await sql`
    UPDATE meeting_v3_meetings
    SET
      lifecycle_state='live',
      ended_at=NULL,
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='closing'
    RETURNING id::text
  `;

  if(!rows.length) redirect(meetingPath(meetingId,"/close","error=locked"));

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.returned_to_live","meeting",meetingId);
  revalidatePath(meetingPath(meetingId,"/live"));
  revalidatePath(meetingPath(meetingId,"/close"));
  redirect(meetingPath(meetingId,"/live","closing_reopened=1"));
}

export async function createMeetingV3MinutesDraftAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const nextMeetingAt=value(formData,"nextMeetingAt");

  const rows=await sql`
    SELECT
      m.id::text,m.current_minutes_revision,
      jsonb_build_object(
        'meeting',jsonb_build_object(
          'id',m.id,
          'title',m.title,
          'meetingType',m.meeting_type,
          'customTypeLabel',m.custom_type_label,
          'meetingMode',m.meeting_mode,
          'startsAt',m.starts_at,
          'openedAt',m.opened_at,
          'endedAt',m.ended_at,
          'location',m.location,
          'description',m.description,
          'invitedAt',m.invited_at,
          'invitationMethod',m.invitation_method,
          'invitationTimely',m.invitation_timely,
          'agendaSentWithInvitation',m.agenda_sent_with_invitation,
          'quorumConfirmed',m.quorum_confirmed,
          'quorumBasis',m.quorum_basis,
          'quorumNote',m.quorum_note,
          'chairMemberId',m.chair_member_id,
          'minuteTakerMemberId',m.minute_taker_member_id
        ),
        'participants',COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'memberId',p.member_id,
            'name',concat_ws(' ',member.first_name,member.last_name),
            'attendance',p.attendance,
            'votingEligible',p.voting_eligible,
            'role',p.role_in_meeting,
            'joinedAt',p.joined_at,
            'leftAt',p.left_at,
            'note',p.note
          ) ORDER BY member.last_name,member.first_name)
          FROM meeting_v3_participants p
          JOIN members member ON member.id=p.member_id
          WHERE p.meeting_id=m.id
        ),'[]'::jsonb),
        'guests',COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',g.id,'name',g.name,'organization',g.organization,
            'attendance',g.attendance,'joinedAt',g.joined_at,'leftAt',g.left_at,'note',g.note
          ) ORDER BY g.name)
          FROM meeting_v3_guests g
          WHERE g.meeting_id=m.id
        ),'[]'::jsonb),
        'agenda',COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',ai.id,
            'position',ai.position,
            'title',ai.title,
            'type',ai.agenda_type,
            'description',ai.description,
            'status',ai.status,
            'resultCode',ai.result_code,
            'spontaneous',ai.spontaneous,
            'spontaneousReason',ai.spontaneous_reason,
            'announcedWithInvitation',ai.announced_with_invitation,
            'startedAt',ai.started_at,
            'completedAt',ai.completed_at,
            'note',COALESCE((
              SELECT nv.content
              FROM meeting_v3_note_versions nv
              WHERE nv.agenda_item_id=ai.id
              ORDER BY nv.version DESC
              LIMIT 1
            ),''),
            'exclusions',COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',e.id,'memberId',e.member_id,
                'name',COALESCE(concat_ws(' ',em.first_name,em.last_name),e.person_name),
                'reason',e.reason,'startedAt',e.started_at,'endedAt',e.ended_at
              ) ORDER BY e.started_at)
              FROM meeting_v3_vote_exclusions e
              LEFT JOIN members em ON em.id=e.member_id
              WHERE e.agenda_item_id=ai.id
            ),'[]'::jsonb),
            'resolutions',COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',r.id,'number',r.resolution_number,'title',r.title,'decisionText',r.decision_text,
                'voteMethod',r.vote_method,'eligibleVoters',r.eligible_voters,'excludedVoters',r.excluded_voters,
                'yes',r.votes_yes,'no',r.votes_no,'abstain',r.votes_abstain,'outcome',r.decision_outcome,
                'implementationStatus',r.implementation_status,'decidedAt',r.decided_at,
                'namedVotes',COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'memberId',nv.member_id,
                    'name',COALESCE(concat_ws(' ',nm.first_name,nm.last_name),nv.person_name),
                    'vote',nv.vote
                  ) ORDER BY COALESCE(nm.last_name,nv.person_name),nm.first_name)
                  FROM meeting_v3_named_votes nv
                  LEFT JOIN members nm ON nm.id=nv.member_id
                  WHERE nv.resolution_id=r.id
                ),'[]'::jsonb)
              ) ORDER BY r.decided_at)
              FROM meeting_v3_resolutions r
              WHERE r.agenda_item_id=ai.id
            ),'[]'::jsonb),
            'attachments',COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',a.id,'title',a.title,'kind',a.attachment_kind,'documentId',a.document_id
              ) ORDER BY a.created_at)
              FROM meeting_v3_attachments a
              WHERE a.agenda_item_id=ai.id
            ),'[]'::jsonb)
          ) ORDER BY ai.position)
          FROM meeting_v3_agenda_items ai
          WHERE ai.meeting_id=m.id
        ),'[]'::jsonb),
        'generalAttachments',COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id',a.id,'title',a.title,'kind',a.attachment_kind,'documentId',a.document_id
          ) ORDER BY a.created_at)
          FROM meeting_v3_attachments a
          WHERE a.meeting_id=m.id AND a.agenda_item_id IS NULL
        ),'[]'::jsonb),
        'generatedAt',now()
      ) AS snapshot
    FROM meeting_v3_meetings m
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='closing'
      AND NOT EXISTS (
        SELECT 1 FROM meeting_v3_agenda_items ai
        WHERE ai.meeting_id=m.id AND ai.status IN ('open','active')
      )
    LIMIT 1
  `;

  const meeting=rows[0];
  if(!meeting) redirect(meetingPath(meetingId,"/close","error=not_ready"));

  const nextRevision=Number(meeting.current_minutes_revision ?? 0)+1;
  const snapshot=meeting.snapshot;

  const inserted=await sql`
    INSERT INTO meeting_v3_minutes_revisions (
      meeting_id,revision,status,snapshot,change_reason,created_by
    )
    VALUES (
      ${meetingId}::uuid,${nextRevision},'draft',
      ${JSON.stringify(snapshot)}::jsonb,
      'Automatisch aus dem Sitzungsabschluss erzeugt',
      ${actor.id}::uuid
    )
    RETURNING id::text,revision
  `;

  if(!inserted.length) redirect(meetingPath(meetingId,"/close","error=minutes"));

  await sql`
    UPDATE meeting_v3_meetings
    SET
      lifecycle_state='minutes_draft',
      minutes_status='draft',
      current_minutes_revision=${nextRevision},
      next_meeting_at=CASE
        WHEN ${nextMeetingAt || null}::text IS NULL THEN next_meeting_at
        ELSE (${nextMeetingAt || null}::timestamp AT TIME ZONE 'Europe/Berlin')
      END,
      ended_at=COALESCE(ended_at,now()),
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='closing'
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"minutes.draft_created","minutes_revision",String(inserted[0].id),{
    revision:nextRevision,nextMeetingAt:nextMeetingAt || null,
  });
  await writeAudit(actor.id,"meeting_v3.minutes_draft_created","meeting_v3",meetingId,{revision:nextRevision});

  revalidatePath(meetingPath(meetingId,"/close"));
  revalidatePath(meetingPath(meetingId,"/minutes"));
  revalidatePath(meetingPath(meetingId));
  revalidatePath("/sitzungen");
  redirect(meetingPath(meetingId,"/minutes","created=1"));
}

export async function submitMeetingV3MinutesReviewAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const rows=await sql`
    UPDATE meeting_v3_meetings
    SET
      lifecycle_state='minutes_review',
      minutes_status='review',
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='minutes_draft'
      AND minutes_status='draft'
    RETURNING id::text,current_minutes_revision
  `;

  if(!rows.length) redirect(meetingPath(meetingId,"/minutes","error=locked"));

  await sql`
    UPDATE meeting_v3_minutes_revisions
    SET status='review'
    WHERE meeting_id=${meetingId}::uuid
      AND revision=${Number(rows[0].current_minutes_revision)}
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"minutes.submitted_for_review","meeting",meetingId,{
    revision:Number(rows[0].current_minutes_revision),
  });

  revalidatePath(meetingPath(meetingId,"/minutes"));
  revalidatePath("/sitzungen");
  redirect(meetingPath(meetingId,"/minutes","review=1"));
}

export async function returnMeetingV3MinutesDraftAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  if(!meetingV3CanApproveMinutes(actor.roles)) redirect("/sitzungen?error=permission");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const reason=value(formData,"reason");
  if(!reason) redirect(meetingPath(meetingId,"/minutes","error=reason"));

  const rows=await sql`
    UPDATE meeting_v3_meetings
    SET
      lifecycle_state='minutes_draft',
      minutes_status='draft',
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='minutes_review'
    RETURNING current_minutes_revision
  `;

  if(!rows.length) redirect(meetingPath(meetingId,"/minutes","error=locked"));

  await sql`
    UPDATE meeting_v3_minutes_revisions
    SET status='draft',change_reason=${reason}
    WHERE meeting_id=${meetingId}::uuid
      AND revision=${Number(rows[0].current_minutes_revision)}
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"minutes.returned","meeting",meetingId,{},reason);
  revalidatePath(meetingPath(meetingId,"/minutes"));
  revalidatePath("/sitzungen");
  redirect(meetingPath(meetingId,"/minutes","returned=1"));
}

export async function archiveMeetingV3MinutesAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  if(!meetingV3CanApproveMinutes(actor.roles)) redirect("/sitzungen?error=permission");
  if(!meetingV3CanApproveMinutes(actor.roles)) redirect("/sitzungen?error=permission");

  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");
  const meetingId=value(formData,"meetingId");

  const rows=await sql`
    UPDATE meeting_v3_meetings
    SET
      lifecycle_state='archived',
      minutes_status='archived',
      archived_at=now(),
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='minutes_review'
      AND minutes_status='review'
    RETURNING id::text,current_minutes_revision
  `;

  if(!rows.length) redirect(meetingPath(meetingId,"/minutes","error=locked"));

  await sql`
    UPDATE meeting_v3_minutes_revisions
    SET status='archived'
    WHERE meeting_id=${meetingId}::uuid
      AND revision=${Number(rows[0].current_minutes_revision)}
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"minutes.archived","meeting",meetingId,{
    revision:Number(rows[0].current_minutes_revision),
  });
  await writeAudit(actor.id,"meeting_v3.archived","meeting_v3",meetingId,{
    revision:Number(rows[0].current_minutes_revision),
  });

  revalidatePath(meetingPath(meetingId,"/minutes"));
  revalidatePath(meetingPath(meetingId));
  revalidatePath("/sitzungen");
  redirect(meetingPath(meetingId,"/minutes","archived=1"));
}
