"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";

const attendanceValues = [
  "invited",
  "present",
  "absent",
  "excused",
  "late",
  "left_early",
] as const;

const resultCodes = ["noted","completed","deferred","resolution","no_decision"] as const;
const noteKinds = ["autosave","checkpoint"] as const;

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

function startPath(meetingId:string,error?:string) {
  return `/sitzungen/${meetingId}/start${error ? `?error=${error}` : ""}`;
}

function livePath(meetingId:string,query?:string) {
  return `/sitzungen/${meetingId}/live${query ? `?${query}` : ""}`;
}

export async function updateMeetingV3ParticipantAction(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const participantId=value(formData,"participantId");
  const attendanceRaw=value(formData,"attendance");
  const attendance=(attendanceValues as readonly string[]).includes(attendanceRaw)
    ? attendanceRaw
    : "invited";
  const votingEligible=value(formData,"votingEligible")==="yes";
  const note=value(formData,"note");
  const returnTo=value(formData,"returnTo")==="live" ? "live" : "start";

  if (!meetingId || !participantId) redirect("/sitzungen?error=missing");

  const rows=await sql`
    UPDATE meeting_v3_participants p
    SET
      attendance=${attendance},
      voting_eligible=${votingEligible},
      joined_at=CASE
        WHEN ${attendance}='present' THEN COALESCE(p.joined_at,now())
        WHEN ${attendance}='late' AND p.joined_at IS NULL THEN NULL
        ELSE p.joined_at
      END,
      left_at=CASE
        WHEN ${attendance}='left_early' THEN COALESCE(p.left_at,now())
        WHEN ${attendance}<>'left_early' THEN NULL
        ELSE p.left_at
      END,
      note=${note || null},
      updated_by=${actor.id}::uuid,
      updated_at=now()
    FROM meeting_v3_meetings m
    WHERE p.id=${participantId}::uuid
      AND p.meeting_id=m.id
      AND m.id=${meetingId}::uuid
      AND m.lifecycle_state IN ('ready','live')
    RETURNING p.id::text,p.member_id::text
  `;

  if (!rows.length) redirect(returnTo==="live" ? livePath(meetingId,"error=locked") : startPath(meetingId,"locked"));

  await writeMeetingV3Audit(meetingId,actor.id,"participant.updated","participant",participantId,{
    attendance,votingEligible,note:note || null,
  });

  revalidatePath(`/sitzungen/${meetingId}/start`);
  revalidatePath(`/sitzungen/${meetingId}/live`);

  redirect(returnTo==="live" ? livePath(meetingId,"participant=1") : startPath(meetingId,"participant"));
}

export async function updateMeetingV3QuorumAction(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const confirmed=booleanChoice(value(formData,"quorumConfirmed"));
  const basis=value(formData,"quorumBasis");
  const note=value(formData,"quorumNote");
  const returnTo=value(formData,"returnTo")==="live" ? "live" : "start";

  if (!meetingId || confirmed==null) redirect(startPath(meetingId || "unknown","quorum"));

  const rows=await sql`
    UPDATE meeting_v3_meetings
    SET
      quorum_confirmed=${confirmed},
      quorum_basis=${basis || null},
      quorum_note=${note || null},
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE id=${meetingId}::uuid
      AND lifecycle_state IN ('ready','live')
    RETURNING id::text
  `;

  if (!rows.length) redirect(returnTo==="live" ? livePath(meetingId,"error=locked") : startPath(meetingId,"locked"));

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.quorum_updated","meeting",meetingId,{
    quorumConfirmed:confirmed,quorumBasis:basis || null,quorumNote:note || null,
  });

  revalidatePath(`/sitzungen/${meetingId}/start`);
  revalidatePath(`/sitzungen/${meetingId}/live`);
  redirect(returnTo==="live" ? livePath(meetingId,"quorum=1") : startPath(meetingId,"quorum"));
}

export async function startMeetingV3Action(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  if (!meetingId) redirect("/sitzungen?error=missing");

  const rows=await sql`
    SELECT
      m.id::text,m.lifecycle_state,m.quorum_confirmed,
      m.chair_member_id::text AS chair_member_id,
      m.minute_taker_member_id::text AS minute_taker_member_id,
      (SELECT count(*)::int FROM meeting_v3_participants p
        WHERE p.meeting_id=m.id AND p.attendance='invited') AS unresolved_count,
      (SELECT count(*)::int FROM meeting_v3_participants p
        WHERE p.meeting_id=m.id AND p.attendance='present') AS present_count,
      (SELECT count(*)::int FROM meeting_v3_participants p
        WHERE p.meeting_id=m.id AND p.attendance='present' AND p.voting_eligible=true) AS eligible_present,
      EXISTS (
        SELECT 1 FROM meeting_v3_participants p
        WHERE p.meeting_id=m.id
          AND p.member_id=m.chair_member_id
          AND p.attendance='present'
      ) AS chair_present,
      EXISTS (
        SELECT 1 FROM meeting_v3_participants p
        WHERE p.meeting_id=m.id
          AND p.member_id=m.minute_taker_member_id
          AND p.attendance='present'
      ) AS minute_taker_present,
      (SELECT count(*)::int FROM meeting_v3_agenda_items ai
        WHERE ai.meeting_id=m.id AND ai.status IN ('open','active')) AS remaining_agenda
    FROM meeting_v3_meetings m
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='ready'
    LIMIT 1
  `;

  const meeting=rows[0];
  if (!meeting) redirect(startPath(meetingId,"locked"));
  if (Number(meeting.unresolved_count ?? 0)>0) redirect(startPath(meetingId,"attendance"));
  if (!meeting.chair_present || !meeting.minute_taker_present) redirect(startPath(meetingId,"officers_present"));
  if (meeting.quorum_confirmed!==true) redirect(startPath(meetingId,"quorum"));
  if (Number(meeting.present_count ?? 0)===0) redirect(startPath(meetingId,"attendance"));
  if (Number(meeting.remaining_agenda ?? 0)===0) redirect(startPath(meetingId,"agenda"));

  const started=await sql`
    WITH started_meeting AS (
      UPDATE meeting_v3_meetings
      SET
        lifecycle_state='live',
        opened_at=COALESCE(opened_at,now()),
        row_version=row_version+1,
        updated_by=${actor.id}::uuid
      WHERE id=${meetingId}::uuid
        AND lifecycle_state='ready'
        AND quorum_confirmed=true
      RETURNING id
    ),
    first_item AS (
      SELECT ai.id
      FROM meeting_v3_agenda_items ai
      JOIN started_meeting sm ON sm.id=ai.meeting_id
      WHERE ai.status='open'
      ORDER BY ai.position
      LIMIT 1
    )
    UPDATE meeting_v3_agenda_items ai
    SET
      status='active',
      started_at=COALESCE(ai.started_at,now()),
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    WHERE ai.id=(SELECT id FROM first_item)
    RETURNING ai.id::text,ai.position
  `;

  if (!started.length) redirect(startPath(meetingId,"locked"));

  await sql`
    UPDATE meeting_v3_participants
    SET joined_at=COALESCE(joined_at,now()),updated_by=${actor.id}::uuid,updated_at=now()
    WHERE meeting_id=${meetingId}::uuid AND attendance='present'
  `;

  await writeMeetingV3Audit(meetingId,actor.id,"meeting.started","meeting",meetingId,{
    presentCount:Number(meeting.present_count ?? 0),
    eligiblePresent:Number(meeting.eligible_present ?? 0),
    firstAgendaItemId:String(started[0].id),
  });
  await writeAudit(actor.id,"meeting_v3.started","meeting_v3",meetingId,{
    presentCount:Number(meeting.present_count ?? 0),
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/start`);
  revalidatePath(`/sitzungen/${meetingId}/live`);
  revalidatePath("/sitzungen");
  redirect(livePath(meetingId,"started=1"));
}

export async function activateMeetingV3AgendaAction(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");

  const rows=await sql`
    UPDATE meeting_v3_agenda_items ai
    SET
      status='active',
      started_at=COALESCE(ai.started_at,now()),
      row_version=row_version+1,
      updated_by=${actor.id}::uuid
    FROM meeting_v3_meetings m
    WHERE ai.id=${agendaItemId}::uuid
      AND ai.meeting_id=m.id
      AND m.id=${meetingId}::uuid
      AND m.lifecycle_state='live'
      AND ai.status='open'
      AND NOT EXISTS (
        SELECT 1 FROM meeting_v3_agenda_items other
        WHERE other.meeting_id=m.id AND other.status='active'
      )
    RETURNING ai.id::text
  `;

  if (!rows.length) redirect(livePath(meetingId,"error=agenda_active"));

  await writeMeetingV3Audit(meetingId,actor.id,"agenda.started","agenda_item",agendaItemId);
  revalidatePath(livePath(meetingId));
  redirect(livePath(meetingId,"agenda=1"));
}

export async function saveMeetingV3NoteAction(
  meetingId:string,
  agendaItemId:string,
  content:string,
  requestedKind:"autosave"|"checkpoint"="autosave",
) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) return {ok:false,error:"database"} as const;

  const kind=(noteKinds as readonly string[]).includes(requestedKind)
    ? requestedKind
    : "autosave";
  const safeContent=String(content ?? "").slice(0,50000);

  const latest=await sql`
    SELECT nv.content,nv.version
    FROM meeting_v3_note_versions nv
    JOIN meeting_v3_meetings m ON m.id=nv.meeting_id
    WHERE nv.meeting_id=${meetingId}::uuid
      AND nv.agenda_item_id=${agendaItemId}::uuid
      AND m.lifecycle_state IN ('live','closing')
    ORDER BY nv.version DESC
    LIMIT 1
  `;

  if (latest[0] && String(latest[0].content)===safeContent) {
    return {
      ok:true,
      unchanged:true,
      version:Number(latest[0].version),
      savedAt:new Date().toISOString(),
    } as const;
  }

  for (let attempt=0;attempt<3;attempt+=1) {
    const rows=await sql`
      INSERT INTO meeting_v3_note_versions (
        meeting_id,agenda_item_id,content,version,revision_kind,created_by
      )
      SELECT
        m.id,
        ai.id,
        ${safeContent},
        COALESCE((
          SELECT max(existing.version)
          FROM meeting_v3_note_versions existing
          WHERE existing.meeting_id=m.id
            AND existing.agenda_item_id=ai.id
        ),0)+1,
        ${kind},
        ${actor.id}::uuid
      FROM meeting_v3_meetings m
      JOIN meeting_v3_agenda_items ai ON ai.meeting_id=m.id
      WHERE m.id=${meetingId}::uuid
        AND ai.id=${agendaItemId}::uuid
        AND m.lifecycle_state IN ('live','closing')
      ON CONFLICT DO NOTHING
      RETURNING version,created_at
    `;

    if (rows.length) {
      if (kind==="checkpoint") {
        await writeMeetingV3Audit(meetingId,actor.id,"notes.checkpoint","agenda_item",agendaItemId,{
          version:Number(rows[0].version),
        });
      }
      return {
        ok:true,
        unchanged:false,
        version:Number(rows[0].version),
        savedAt:new Date(String(rows[0].created_at)).toISOString(),
      } as const;
    }
  }

  return {ok:false,error:"conflict"} as const;
}

export async function completeMeetingV3AgendaAction(formData:FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const resultRaw=value(formData,"resultCode");
  const resultCode=(resultCodes as readonly string[]).includes(resultRaw)
    ? resultRaw
    : "completed";

  if(resultCode==="resolution"){
    const resolutionRows=await sql`
      SELECT count(*)::int AS count
      FROM meeting_v3_resolutions r
      JOIN meeting_v3_agenda_items ai ON ai.id=r.agenda_item_id
      WHERE r.agenda_item_id=${agendaItemId}::uuid
        AND ai.meeting_id=${meetingId}::uuid
    `;
    if(Number(resolutionRows[0]?.count ?? 0)===0){
      redirect(livePath(meetingId,"error=resolution_required"));
    }
  }

  const rows=await sql`
    WITH completed_item AS (
      UPDATE meeting_v3_agenda_items ai
      SET
        status=CASE WHEN ${resultCode}='deferred' THEN 'deferred' ELSE 'completed' END,
        result_code=${resultCode},
        completed_at=now(),
        row_version=row_version+1,
        updated_by=${actor.id}::uuid
      FROM meeting_v3_meetings m
      WHERE ai.id=${agendaItemId}::uuid
        AND ai.meeting_id=m.id
        AND m.id=${meetingId}::uuid
        AND m.lifecycle_state='live'
        AND ai.status='active'
      RETURNING ai.id,ai.position,ai.meeting_id
    ),
    next_item AS (
      SELECT ai.id
      FROM meeting_v3_agenda_items ai
      JOIN completed_item done ON done.meeting_id=ai.meeting_id
      WHERE ai.status='open'
      ORDER BY ai.position
      LIMIT 1
    ),
    activated AS (
      UPDATE meeting_v3_agenda_items ai
      SET
        status='active',
        started_at=COALESCE(ai.started_at,now()),
        row_version=row_version+1,
        updated_by=${actor.id}::uuid
      WHERE ai.id=(SELECT id FROM next_item)
      RETURNING ai.id::text
    )
    SELECT
      (SELECT id::text FROM completed_item LIMIT 1) AS completed_id,
      (SELECT id FROM activated LIMIT 1) AS next_id
  `;

  if (!rows.length || !rows[0]?.completed_id) redirect(livePath(meetingId,"error=agenda_state"));

  await writeMeetingV3Audit(meetingId,actor.id,"agenda.completed","agenda_item",agendaItemId,{
    resultCode,nextAgendaItemId:rows[0].next_id ? String(rows[0].next_id) : null,
  });

  revalidatePath(livePath(meetingId));
  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(livePath(meetingId,rows[0].next_id ? "advanced=1" : "agenda_complete=1"));
}
