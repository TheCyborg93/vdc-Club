"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";

const allowedAttendance=["present","absent","excused","late","left_early"] as const;
const allowedResults=["noted","completed","deferred","resolution","no_decision"] as const;

function value(formData:FormData,key:string){
  return String(formData.get(key) ?? "").trim();
}

function correctionPath(meetingId:string,query?:string){
  return `/sitzungen/${meetingId}/minutes/correct${query ? `?${query}` : ""}`;
}

async function auditRevision(
  meetingId:string,
  actorId:string,
  revision:number,
  section:string,
  reason:string,
  details:Record<string,unknown>,
){
  const sql=getDb();
  if(sql){
    await sql`
      INSERT INTO meeting_v3_audit_log (
        meeting_id,actor_user_id,action,entity_type,after_data,reason
      )
      VALUES (
        ${meetingId}::uuid,${actorId}::uuid,'minutes.corrected','minutes_revision',
        ${JSON.stringify({revision,section,...details})}::jsonb,${reason}
      )
    `;
  }
  await writeAudit(actorId,"meeting_v3.minutes_corrected","meeting_v3",meetingId,{
    revision,section,reason,...details,
  });
}

export async function correctMeetingV3MinutesFormalitiesAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const title=value(formData,"title");
  const location=value(formData,"location");
  const quorumBasis=value(formData,"quorumBasis");
  const quorumNote=value(formData,"quorumNote");
  const reason=value(formData,"reason");

  if(!meetingId || !title || !reason){
    redirect(correctionPath(meetingId || "unknown","error=missing"));
  }

  const rows=await sql`
    WITH current AS (
      SELECT
        m.id,
        m.current_minutes_revision,
        mr.snapshot
      FROM meeting_v3_meetings m
      JOIN meeting_v3_minutes_revisions mr
        ON mr.meeting_id=m.id
       AND mr.revision=m.current_minutes_revision
      WHERE m.id=${meetingId}::uuid
        AND m.lifecycle_state='minutes_draft'
        AND m.minutes_status='draft'
        AND mr.status='draft'
      FOR UPDATE OF m
    ),
    prepared AS (
      SELECT
        id,
        current_minutes_revision+1 AS next_revision,
        snapshot || jsonb_build_object(
          'meeting',
          COALESCE(snapshot->'meeting','{}'::jsonb) || jsonb_build_object(
            'title',${title},
            'location',${location || null},
            'quorumBasis',${quorumBasis || null},
            'quorumNote',${quorumNote || null}
          ),
          'generatedAt',now()
        ) AS next_snapshot
      FROM current
    ),
    inserted AS (
      INSERT INTO meeting_v3_minutes_revisions (
        meeting_id,revision,status,snapshot,change_reason,created_by
      )
      SELECT id,next_revision,'draft',next_snapshot,${reason},${actor.id}::uuid
      FROM prepared
      RETURNING meeting_id,revision,id
    ),
    updated AS (
      UPDATE meeting_v3_meetings m
      SET
        current_minutes_revision=i.revision,
        row_version=row_version+1,
        updated_by=${actor.id}::uuid
      FROM inserted i
      WHERE m.id=i.meeting_id
      RETURNING m.id
    )
    SELECT revision,id::text FROM inserted
  `;

  if(!rows.length) redirect(correctionPath(meetingId,"error=locked"));

  const revision=Number(rows[0].revision);
  await auditRevision(meetingId,actor.id,revision,"formalities",reason,{
    title,location:location || null,
  });

  revalidatePath(`/sitzungen/${meetingId}/minutes`);
  revalidatePath(correctionPath(meetingId));
  redirect(correctionPath(meetingId,"saved=formalities"));
}

export async function correctMeetingV3MinutesParticipantAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const memberId=value(formData,"memberId");
  const attendanceRaw=value(formData,"attendance");
  const attendance=(allowedAttendance as readonly string[]).includes(attendanceRaw)
    ? attendanceRaw
    : null;
  const votingEligible=value(formData,"votingEligible")==="yes";
  const note=value(formData,"note");
  const reason=value(formData,"reason");

  if(!meetingId || !memberId || !attendance || !reason){
    redirect(correctionPath(meetingId || "unknown","error=missing"));
  }

  const rows=await sql`
    WITH current AS (
      SELECT
        m.id,
        m.current_minutes_revision,
        mr.snapshot
      FROM meeting_v3_meetings m
      JOIN meeting_v3_minutes_revisions mr
        ON mr.meeting_id=m.id
       AND mr.revision=m.current_minutes_revision
      WHERE m.id=${meetingId}::uuid
        AND m.lifecycle_state='minutes_draft'
        AND m.minutes_status='draft'
        AND mr.status='draft'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(mr.snapshot->'participants','[]'::jsonb)) p(item)
          WHERE p.item->>'memberId'=${memberId}
        )
      FOR UPDATE OF m
    ),
    prepared AS (
      SELECT
        id,
        current_minutes_revision+1 AS next_revision,
        snapshot || jsonb_build_object(
          'participants',
          (
            SELECT COALESCE(jsonb_agg(
              CASE
                WHEN p.item->>'memberId'=${memberId}
                  THEN p.item || jsonb_build_object(
                    'attendance',${attendance},
                    'votingEligible',${votingEligible},
                    'note',${note || null}
                  )
                ELSE p.item
              END
              ORDER BY p.ord
            ),'[]'::jsonb)
            FROM jsonb_array_elements(COALESCE(snapshot->'participants','[]'::jsonb))
              WITH ORDINALITY p(item,ord)
          ),
          'generatedAt',now()
        ) AS next_snapshot
      FROM current
    ),
    inserted AS (
      INSERT INTO meeting_v3_minutes_revisions (
        meeting_id,revision,status,snapshot,change_reason,created_by
      )
      SELECT id,next_revision,'draft',next_snapshot,${reason},${actor.id}::uuid
      FROM prepared
      RETURNING meeting_id,revision,id
    ),
    updated AS (
      UPDATE meeting_v3_meetings m
      SET
        current_minutes_revision=i.revision,
        row_version=row_version+1,
        updated_by=${actor.id}::uuid
      FROM inserted i
      WHERE m.id=i.meeting_id
      RETURNING m.id
    )
    SELECT revision,id::text FROM inserted
  `;

  if(!rows.length) redirect(correctionPath(meetingId,"error=locked"));

  const revision=Number(rows[0].revision);
  await auditRevision(meetingId,actor.id,revision,"participant",reason,{
    memberId,attendance,votingEligible,
  });

  revalidatePath(`/sitzungen/${meetingId}/minutes`);
  revalidatePath(correctionPath(meetingId));
  redirect(correctionPath(meetingId,"saved=participant"));
}

export async function correctMeetingV3MinutesAgendaAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const title=value(formData,"title");
  const description=value(formData,"description");
  const note=value(formData,"note");
  const resultRaw=value(formData,"resultCode");
  const resultCode=(allowedResults as readonly string[]).includes(resultRaw)
    ? resultRaw
    : null;
  const reason=value(formData,"reason");

  if(!meetingId || !agendaItemId || !title || !resultCode || !reason){
    redirect(correctionPath(meetingId || "unknown","error=missing"));
  }

  const rows=await sql`
    WITH current AS (
      SELECT
        m.id,
        m.current_minutes_revision,
        mr.snapshot
      FROM meeting_v3_meetings m
      JOIN meeting_v3_minutes_revisions mr
        ON mr.meeting_id=m.id
       AND mr.revision=m.current_minutes_revision
      WHERE m.id=${meetingId}::uuid
        AND m.lifecycle_state='minutes_draft'
        AND m.minutes_status='draft'
        AND mr.status='draft'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(mr.snapshot->'agenda','[]'::jsonb)) a(item)
          WHERE a.item->>'id'=${agendaItemId}
        )
      FOR UPDATE OF m
    ),
    prepared AS (
      SELECT
        id,
        current_minutes_revision+1 AS next_revision,
        snapshot || jsonb_build_object(
          'agenda',
          (
            SELECT COALESCE(jsonb_agg(
              CASE
                WHEN a.item->>'id'=${agendaItemId}
                  THEN a.item || jsonb_build_object(
                    'title',${title},
                    'description',${description || null},
                    'note',${note},
                    'resultCode',${resultCode}
                  )
                ELSE a.item
              END
              ORDER BY a.ord
            ),'[]'::jsonb)
            FROM jsonb_array_elements(COALESCE(snapshot->'agenda','[]'::jsonb))
              WITH ORDINALITY a(item,ord)
          ),
          'generatedAt',now()
        ) AS next_snapshot
      FROM current
    ),
    inserted AS (
      INSERT INTO meeting_v3_minutes_revisions (
        meeting_id,revision,status,snapshot,change_reason,created_by
      )
      SELECT id,next_revision,'draft',next_snapshot,${reason},${actor.id}::uuid
      FROM prepared
      RETURNING meeting_id,revision,id
    ),
    updated AS (
      UPDATE meeting_v3_meetings m
      SET
        current_minutes_revision=i.revision,
        row_version=row_version+1,
        updated_by=${actor.id}::uuid
      FROM inserted i
      WHERE m.id=i.meeting_id
      RETURNING m.id
    )
    SELECT revision,id::text FROM inserted
  `;

  if(!rows.length) redirect(correctionPath(meetingId,"error=locked"));

  const revision=Number(rows[0].revision);
  await auditRevision(meetingId,actor.id,revision,"agenda",reason,{
    agendaItemId,title,resultCode,
  });

  revalidatePath(`/sitzungen/${meetingId}/minutes`);
  revalidatePath(correctionPath(meetingId));
  redirect(correctionPath(meetingId,"saved=agenda"));
}
