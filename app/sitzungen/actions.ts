"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import {
  getMeetingV3Readiness,
  meetingV3AgendaTypes,
  meetingV3Modes,
  meetingV3Types,
  type MeetingV3AgendaType,
  type MeetingV3Mode,
  type MeetingV3Type,
} from "@/lib/meeting-v3";

function value(formData: FormData,key: string) {
  return String(formData.get(key) ?? "").trim();
}

function booleanChoice(raw: string) {
  if (raw === "yes") return true;
  if (raw === "no") return false;
  return null;
}

async function writeMeetingV3Audit(
  meetingId: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  afterData: Record<string,unknown> = {},
  reason?: string,
) {
  const sql=getDb();
  if (!sql) return;
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

export async function createMeetingV3Action(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const title=value(formData,"title");
  const startsAt=value(formData,"startsAt");
  const location=value(formData,"location");
  const description=value(formData,"description");

  const typeRaw=value(formData,"meetingType");
  const meetingType=(meetingV3Types as readonly string[]).includes(typeRaw)
    ? typeRaw as MeetingV3Type
    : "board";

  const modeRaw=value(formData,"meetingMode");
  const meetingMode=(meetingV3Modes as readonly string[]).includes(modeRaw)
    ? modeRaw as MeetingV3Mode
    : "in_person";

  const customTypeLabel=value(formData,"customTypeLabel");

  if (!title || !startsAt || (meetingType==="custom" && !customTypeLabel)) {
    redirect("/sitzungen?error=missing");
  }

  const rows=await sql`
    WITH detected_roles AS (
      SELECT
        (
          SELECT au.member_id
          FROM app_users au
          JOIN user_roles ur ON ur.user_id=au.id
          JOIN members m ON m.id=au.member_id
          WHERE au.status='active'
            AND m.status='active'
            AND au.member_id IS NOT NULL
            AND ur.role_key='chair'
          ORDER BY au.display_name
          LIMIT 1
        ) AS chair_member_id,
        (
          SELECT au.member_id
          FROM app_users au
          JOIN user_roles ur ON ur.user_id=au.id
          JOIN members m ON m.id=au.member_id
          WHERE au.status='active'
            AND m.status='active'
            AND au.member_id IS NOT NULL
            AND ur.role_key='secretary'
          ORDER BY au.display_name
          LIMIT 1
        ) AS minute_taker_member_id
    ),
    chosen_template AS (
      SELECT id
      FROM meeting_v3_templates
      WHERE meeting_type=${meetingType}
        AND is_default=true
        AND is_active=true
      ORDER BY created_at
      LIMIT 1
    ),
    new_meeting AS (
      INSERT INTO meeting_v3_meetings (
        title,meeting_type,custom_type_label,lifecycle_state,meeting_mode,
        starts_at,location,description,
        chair_member_id,minute_taker_member_id,template_id,
        created_by,updated_by
      )
      SELECT
        ${title},
        ${meetingType},
        ${meetingType==="custom" ? customTypeLabel : null},
        'preparation',
        ${meetingMode},
        (${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
        ${location || null},
        ${description || null},
        dr.chair_member_id,
        dr.minute_taker_member_id,
        ct.id,
        ${actor.id}::uuid,
        ${actor.id}::uuid
      FROM detected_roles dr
      LEFT JOIN chosen_template ct ON true
      RETURNING id,chair_member_id,minute_taker_member_id,template_id
    ),
    participant_source AS (
      SELECT DISTINCT au.member_id
      FROM app_users au
      JOIN members m ON m.id=au.member_id
      LEFT JOIN user_roles ur ON ur.user_id=au.id
      CROSS JOIN new_meeting nm
      WHERE au.status='active'
        AND m.status='active'
        AND au.member_id IS NOT NULL
        AND (
          ${meetingType}<>'board'
          OR ur.role_key IN (
            'chair','vice_chair','treasurer','media_director',
            'sport_director','secretary','board'
          )
        )
    ),
    inserted_participants AS (
      INSERT INTO meeting_v3_participants (
        meeting_id,member_id,attendance,voting_eligible,role_in_meeting,updated_by
      )
      SELECT
        nm.id,
        ps.member_id,
        'invited',
        true,
        CASE
          WHEN ps.member_id=nm.chair_member_id THEN 'chair'
          WHEN ps.member_id=nm.minute_taker_member_id THEN 'minute_taker'
          ELSE 'participant'
        END,
        ${actor.id}::uuid
      FROM new_meeting nm
      CROSS JOIN participant_source ps
      ON CONFLICT (meeting_id,member_id) DO NOTHING
      RETURNING id
    ),
    inserted_agenda AS (
      INSERT INTO meeting_v3_agenda_items (
        meeting_id,position,title,agenda_type,description,estimated_minutes,
        status,announced_with_invitation,created_by,updated_by
      )
      SELECT
        nm.id,
        ti.position,
        ti.title,
        ti.agenda_type,
        ti.description,
        ti.estimated_minutes,
        'open',
        true,
        ${actor.id}::uuid,
        ${actor.id}::uuid
      FROM new_meeting nm
      JOIN meeting_v3_template_items ti ON ti.template_id=nm.template_id
      RETURNING id
    )
    SELECT id::text FROM new_meeting
  `;

  const id=rows[0]?.id ? String(rows[0].id) : null;
  if (!id) redirect("/sitzungen?error=create");

  await writeMeetingV3Audit(id,actor.id,"meeting.created","meeting",id,{
    title,meetingType,meetingMode,autoParticipants:true,autoOfficers:true,autoAgenda:true,
  });
  await writeAudit(actor.id,"meeting_v3.created","meeting_v3",id,{title,meetingType});

  revalidatePath("/sitzungen");
  revalidatePath("/");
  redirect(`/sitzungen/${id}?created=1`);
}

export async function updateMeetingV3BasicsAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const title=value(formData,"title");
  const startsAt=value(formData,"startsAt");
  const location=value(formData,"location");
  const description=value(formData,"description");
  const modeRaw=value(formData,"meetingMode");
  const meetingMode=(meetingV3Modes as readonly string[]).includes(modeRaw)
    ? modeRaw as MeetingV3Mode
    : "in_person";

  if (!meetingId || !title || !startsAt) {
    redirect(`/sitzungen/${meetingId}?error=missing`);
  }

  const rows=await sql`
    UPDATE meeting_v3_meetings
    SET
      title=${title},
      starts_at=(${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
      location=${location || null},
      description=${description || null},
      meeting_mode=${meetingMode},
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='preparation'
    RETURNING id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=locked`);

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.basics_updated","meeting",meetingId,{
    title,startsAt,location:location || null,meetingMode,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath("/sitzungen");
  redirect(`/sitzungen/${meetingId}?saved=1`);
}

export async function updateMeetingV3InvitationAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const invitedAt=value(formData,"invitedAt");
  const invitationMethod=value(formData,"invitationMethod");
  const invitationTimely=booleanChoice(value(formData,"invitationTimely"));
  const agendaSent=booleanChoice(value(formData,"agendaSentWithInvitation"));

  if (!meetingId || !invitedAt || !invitationMethod || invitationTimely==null || agendaSent==null) {
    redirect(`/sitzungen/${meetingId}?error=invitation`);
  }

  const rows=await sql`
    UPDATE meeting_v3_meetings
    SET
      invited_at=(${invitedAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
      invitation_method=${invitationMethod},
      invitation_timely=${invitationTimely},
      agenda_sent_with_invitation=${agendaSent},
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='preparation'
    RETURNING id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=locked`);

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.invitation_updated","meeting",meetingId,{
    invitedAt,invitationMethod,invitationTimely,agendaSentWithInvitation:agendaSent,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?invitation=1`);
}

export async function updateMeetingV3OfficersAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const chairMemberId=value(formData,"chairMemberId");
  const minuteTakerMemberId=value(formData,"minuteTakerMemberId");

  if (!meetingId || !chairMemberId || !minuteTakerMemberId) {
    redirect(`/sitzungen/${meetingId}?error=officers`);
  }

  const rows=await sql`
    UPDATE meeting_v3_meetings m
    SET
      chair_member_id=${chairMemberId}::uuid,
      minute_taker_member_id=${minuteTakerMemberId}::uuid,
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
      AND EXISTS (
        SELECT 1 FROM meeting_v3_participants p
        WHERE p.meeting_id=m.id AND p.member_id=${chairMemberId}::uuid
      )
      AND EXISTS (
        SELECT 1 FROM meeting_v3_participants p
        WHERE p.meeting_id=m.id AND p.member_id=${minuteTakerMemberId}::uuid
      )
    RETURNING m.id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=officers`);

  await sql`
    UPDATE meeting_v3_participants
    SET
      role_in_meeting=CASE
        WHEN member_id=${chairMemberId}::uuid THEN 'chair'
        WHEN member_id=${minuteTakerMemberId}::uuid THEN 'minute_taker'
        ELSE 'participant'
      END,
      updated_by=${actor.id}::uuid,
      updated_at=now()
    WHERE meeting_id=${meetingId}::uuid
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.officers_updated","meeting",meetingId,{
    chairMemberId,minuteTakerMemberId,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?officers=1`);
}

export async function addMeetingV3AgendaAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const title=value(formData,"title");
  const description=value(formData,"description");
  const typeRaw=value(formData,"agendaType");
  const agendaType=(meetingV3AgendaTypes as readonly string[]).includes(typeRaw)
    ? typeRaw as MeetingV3AgendaType
    : "consultation";

  if (!meetingId || !title) redirect(`/sitzungen/${meetingId}?error=agenda`);

  const rows=await sql`
    INSERT INTO meeting_v3_agenda_items (
      meeting_id,position,title,agenda_type,description,status,
      announced_with_invitation,created_by,updated_by
    )
    SELECT
      m.id,
      COALESCE((
        SELECT MAX(ai.position)
        FROM meeting_v3_agenda_items ai
        WHERE ai.meeting_id=m.id
      ),0)+1,
      ${title},
      ${agendaType},
      ${description || null},
      'open',
      (m.invited_at IS NULL),
      ${actor.id}::uuid,
      ${actor.id}::uuid
    FROM meeting_v3_meetings m
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
    RETURNING id::text,position
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=locked`);

  const agendaId=String(rows[0].id);
  await writeMeetingV3Audit(meetingId,actor.id,"agenda.created","agenda_item",agendaId,{
    title,agendaType,position:Number(rows[0].position),
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?agenda=1`);
}

export async function markMeetingV3ReadyAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  if (!meetingId) redirect("/sitzungen?error=missing");

  const rows=await sql`
    SELECT
      m.id::text,
      m.chair_member_id::text AS chair_member_id,
      m.minute_taker_member_id::text AS minute_taker_member_id,
      m.invited_at,m.invitation_method,m.invitation_timely,m.agenda_sent_with_invitation,
      (SELECT count(*)::int FROM meeting_v3_participants p WHERE p.meeting_id=m.id) AS participant_count,
      (SELECT count(*)::int FROM meeting_v3_agenda_items ai WHERE ai.meeting_id=m.id) AS agenda_count
    FROM meeting_v3_meetings m
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
    LIMIT 1
  `;

  const meeting=rows[0];
  if (!meeting) redirect(`/sitzungen/${meetingId}?error=locked`);

  const readiness=getMeetingV3Readiness({
    chairMemberId: meeting.chair_member_id ? String(meeting.chair_member_id) : null,
    minuteTakerMemberId: meeting.minute_taker_member_id ? String(meeting.minute_taker_member_id) : null,
    invitedAt: meeting.invited_at,
    invitationMethod: meeting.invitation_method ? String(meeting.invitation_method) : null,
    invitationTimely: meeting.invitation_timely as boolean | null,
    agendaSentWithInvitation: meeting.agenda_sent_with_invitation as boolean | null,
    participantCount: Number(meeting.participant_count ?? 0),
    agendaCount: Number(meeting.agenda_count ?? 0),
  });

  if (!readiness.ready) {
    redirect(`/sitzungen/${meetingId}?error=not_ready`);
  }

  await sql`
    UPDATE meeting_v3_meetings
    SET
      lifecycle_state='ready',
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='preparation'
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.marked_ready","meeting",meetingId,{
    readiness:readiness.checks,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath("/sitzungen");
  redirect(`/sitzungen/${meetingId}?ready=1`);
}

export async function reopenMeetingV3PreparationAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");
  const meetingId=value(formData,"meetingId");

  const rows=await sql`
    UPDATE meeting_v3_meetings
    SET
      lifecycle_state='preparation',
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state='ready'
    RETURNING id::text
  `;
  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=locked`);

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.returned_to_preparation","meeting",meetingId);
  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath("/sitzungen");
  redirect(`/sitzungen/${meetingId}?preparation=1`);
}


export async function addMeetingV3ParticipantAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const memberId=value(formData,"memberId");
  if(!meetingId || !memberId) redirect(`/sitzungen/${meetingId}?error=participant`);

  const rows=await sql`
    INSERT INTO meeting_v3_participants (
      meeting_id,member_id,attendance,voting_eligible,role_in_meeting,updated_by
    )
    SELECT m.id,mem.id,'invited',true,'participant',${actor.id}::uuid
    FROM meeting_v3_meetings m
    JOIN members mem ON mem.id=${memberId}::uuid AND mem.status='active'
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
    ON CONFLICT (meeting_id,member_id) DO NOTHING
    RETURNING id::text
  `;

  if(!rows.length) redirect(`/sitzungen/${meetingId}?error=participant`);

  const participantId=String(rows[0].id);
  await writeMeetingV3Audit(meetingId,actor.id,"participant.added","participant",participantId,{memberId});
  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?participant=1`);
}

export async function removeMeetingV3ParticipantAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const participantId=value(formData,"participantId");
  if(!meetingId || !participantId) redirect(`/sitzungen/${meetingId}?error=participant`);

  const rows=await sql`
    DELETE FROM meeting_v3_participants p
    USING meeting_v3_meetings m
    WHERE p.id=${participantId}::uuid
      AND p.meeting_id=m.id
      AND m.id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
      AND p.member_id IS DISTINCT FROM m.chair_member_id
      AND p.member_id IS DISTINCT FROM m.minute_taker_member_id
    RETURNING p.id::text,p.member_id::text
  `;

  if(!rows.length) redirect(`/sitzungen/${meetingId}?error=participant_officer`);

  await writeMeetingV3Audit(meetingId,actor.id,"participant.removed","participant",participantId,{
    memberId:String(rows[0].member_id),
  });
  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?participant=1`);
}

export async function updateMeetingV3AgendaAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const title=value(formData,"title");
  const description=value(formData,"description");
  const estimatedRaw=value(formData,"estimatedMinutes");
  const estimatedMinutes=estimatedRaw ? Number(estimatedRaw) : null;
  const typeRaw=value(formData,"agendaType");
  const agendaType=(meetingV3AgendaTypes as readonly string[]).includes(typeRaw)
    ? typeRaw as MeetingV3AgendaType
    : "consultation";

  if(!meetingId || !agendaItemId || !title || (estimatedMinutes!==null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes<=0))){
    redirect(`/sitzungen/${meetingId}?error=agenda`);
  }

  const rows=await sql`
    UPDATE meeting_v3_agenda_items ai
    SET
      title=${title},
      agenda_type=${agendaType},
      description=${description || null},
      estimated_minutes=${estimatedMinutes},
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    FROM meeting_v3_meetings m
    WHERE ai.id=${agendaItemId}::uuid
      AND ai.meeting_id=m.id
      AND m.id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
    RETURNING ai.id::text,ai.position
  `;

  if(!rows.length) redirect(`/sitzungen/${meetingId}?error=locked`);

  await writeMeetingV3Audit(meetingId,actor.id,"agenda.updated","agenda_item",agendaItemId,{
    title,agendaType,description:description || null,estimatedMinutes,
  });
  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?agenda=1`);
}

export async function deleteMeetingV3AgendaAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  if(!meetingId || !agendaItemId) redirect(`/sitzungen/${meetingId}?error=agenda`);

  const linked=await sql`
    SELECT EXISTS(
      SELECT 1 FROM meeting_v3_attachments
      WHERE agenda_item_id=${agendaItemId}::uuid
    ) AS has_attachment
  `;
  if(linked[0]?.has_attachment) redirect(`/sitzungen/${meetingId}?error=agenda_linked`);

  const rows=await sql`
    DELETE FROM meeting_v3_agenda_items ai
    USING meeting_v3_meetings m
    WHERE ai.id=${agendaItemId}::uuid
      AND ai.meeting_id=m.id
      AND m.id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
    RETURNING ai.id::text,ai.position,ai.title
  `;

  if(!rows.length) redirect(`/sitzungen/${meetingId}?error=locked`);

  await sql`
    UPDATE meeting_v3_agenda_items
    SET position=position-1,updated_by=${actor.id}::uuid,row_version=row_version+1
    WHERE meeting_id=${meetingId}::uuid
      AND position>${Number(rows[0].position)}
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"agenda.deleted","agenda_item",agendaItemId,{
    title:String(rows[0].title),position:Number(rows[0].position),
  });
  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?agenda=1`);
}

export async function moveMeetingV3AgendaAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const direction=value(formData,"direction");
  if(!meetingId || !agendaItemId || !["up","down"].includes(direction)){
    redirect(`/sitzungen/${meetingId}?error=agenda`);
  }

  const current=await sql`
    SELECT ai.id::text,ai.position
    FROM meeting_v3_agenda_items ai
    JOIN meeting_v3_meetings m ON m.id=ai.meeting_id
    WHERE ai.id=${agendaItemId}::uuid
      AND ai.meeting_id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
    LIMIT 1
  `;
  if(!current[0]) redirect(`/sitzungen/${meetingId}?error=locked`);

  const currentPosition=Number(current[0].position);
  const target=await sql`
    SELECT id::text,position
    FROM meeting_v3_agenda_items
    WHERE meeting_id=${meetingId}::uuid
      AND position ${direction==="up" ? sql`< ${currentPosition}` : sql`> ${currentPosition}`}
    ORDER BY position ${direction==="up" ? sql`DESC` : sql`ASC`}
    LIMIT 1
  `;
  if(!target[0]) redirect(`/sitzungen/${meetingId}?agenda=1`);

  const targetId=String(target[0].id);
  const targetPosition=Number(target[0].position);
  await sql`
    UPDATE meeting_v3_agenda_items
    SET position=-1,updated_by=${actor.id}::uuid,row_version=row_version+1
    WHERE id=${agendaItemId}::uuid
  `;
  await sql`
    UPDATE meeting_v3_agenda_items
    SET position=${currentPosition},updated_by=${actor.id}::uuid,row_version=row_version+1
    WHERE id=${targetId}::uuid
  `;
  await sql`
    UPDATE meeting_v3_agenda_items
    SET position=${targetPosition},updated_by=${actor.id}::uuid,row_version=row_version+1
    WHERE id=${agendaItemId}::uuid
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"agenda.reordered","agenda_item",agendaItemId,{
    from:currentPosition,to:targetPosition,direction,
  });
  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?agenda=1`);
}
