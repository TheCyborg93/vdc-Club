"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { ensureTrainingSchedule } from "@/lib/training";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function revalidateTraining(sessionId?: string) {
  revalidatePath("/training");
  if (sessionId) revalidatePath(`/training/${sessionId}`);
  revalidatePath("/kalender");
  revalidatePath("/statistik");
  revalidatePath("/");
}

export async function saveTrainingAttendanceAction(formData: FormData) {
  const actor = await requirePermission("training.write");
  const sql = getDb();
  if (!sql) redirect("/training?error=database");

  const sessionId = value(formData,"sessionId");
  const notes = value(formData,"notes");
  if (!sessionId) redirect("/training?error=missing");

  const sessionRows = await sql`
    SELECT id::text,scheduled_at,status,event_id::text
    FROM training_sessions
    WHERE id=${sessionId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const session=sessionRows[0];

  if (!session || session.status === "cancelled") {
    redirect(`/training/${sessionId}?error=session`);
  }

  if (new Date(String(session.scheduled_at)).getTime() > Date.now()) {
    redirect(`/training/${sessionId}?error=future`);
  }

  const members = await sql`
    SELECT id::text
    FROM members
    WHERE status IN ('active','passive')
      AND (join_date IS NULL OR join_date <= (${String(session.scheduled_at)}::timestamptz AT TIME ZONE 'Europe/Berlin')::date)
      AND (leave_date IS NULL OR leave_date >= (${String(session.scheduled_at)}::timestamptz AT TIME ZONE 'Europe/Berlin')::date)
    ORDER BY last_name,first_name
  `;

  const rows = members.map((member) => {
    const memberId=String(member.id);
    const raw=value(formData,`attendance_${memberId}`);
    const attendance = raw === "present" || raw === "excused" ? raw : "absent";
    return { memberId, attendance };
  });

  await sql`DELETE FROM training_attendance WHERE session_id=${sessionId}::uuid`;

  if (rows.length) {
    await sql`
      INSERT INTO training_attendance (session_id,member_id,attendance)
      SELECT
        ${sessionId}::uuid,
        (entry->>'memberId')::uuid,
        entry->>'attendance'
      FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) AS entry
    `;
  }

  await sql`
    UPDATE training_sessions
    SET
      status='completed',
      notes=${notes || null},
      attendance_recorded_at=now(),
      completed_at=COALESCE(completed_at,now())
    WHERE id=${sessionId}::uuid
      AND deleted_at IS NULL
  `;

  if (session.event_id) {
    await sql`
      UPDATE club_events
      SET description=${notes
        ? "Training durchgeführt · " + notes
        : "Training durchgeführt · Anwesenheit erfasst"},
        updated_at=now()
      WHERE id=${String(session.event_id)}::uuid
        AND deleted_at IS NULL
    `;
  }

  const present = rows.filter((row)=>row.attendance==="present").length;
  const excused = rows.filter((row)=>row.attendance==="excused").length;

  await writeAudit(actor.id,"training.attendance_saved","training_session",sessionId,{
    present,
    absent:rows.length-present-excused,
    excused,
    note:Boolean(notes),
  });

  revalidateTraining(sessionId);
  redirect(`/training/${sessionId}?saved=1`);
}


export async function resetTrainingAttendanceAction(formData: FormData) {
  const actor=await requirePermission("training.write");
  const sql=getDb();
  if (!sql) redirect("/training?error=database");

  const sessionId=value(formData,"sessionId");
  if (!sessionId) redirect("/training?error=missing");

  const rows=await sql`
    SELECT id::text,source,event_id::text,notes,attendance_recorded_at
    FROM training_sessions
    WHERE id=${sessionId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const session=rows[0];

  if (!session || !session.attendance_recorded_at) {
    redirect(`/training/${sessionId}?error=session`);
  }

  await sql`DELETE FROM training_attendance WHERE session_id=${sessionId}::uuid`;

  await sql`
    UPDATE training_sessions
    SET
      status='planned',
      attendance_recorded_at=NULL,
      completed_at=NULL
    WHERE id=${sessionId}::uuid
      AND deleted_at IS NULL
  `;

  if (session.event_id) {
    await sql`
      UPDATE club_events
      SET
        title=CASE WHEN ${String(session.source)}='special' THEN 'Sondertraining' ELSE 'Vereinstraining' END,
        description=CASE
          WHEN ${String(session.source)}='special' THEN COALESCE(${session.notes ? String(session.notes) : null},'Sondertraining · Ende offen')
          ELSE 'Regeltraining · Beginn 19:00 Uhr · Ende offen'
        END,
        updated_at=now()
      WHERE id=${String(session.event_id)}::uuid
        AND deleted_at IS NULL
    `;
  }

  await writeAudit(actor.id,"training.attendance_reset","training_session",sessionId);

  revalidateTraining(sessionId);
  redirect(`/training/${sessionId}?reset=1`);
}
export async function cancelTrainingSessionAction(formData: FormData) {
  const actor = await requirePermission("training.write");
  const sql = getDb();
  if (!sql) redirect("/training?error=database");

  const sessionId=value(formData,"sessionId");
  if (!sessionId) redirect("/training?error=missing");

  await sql`
    UPDATE training_sessions
    SET
      status='cancelled',
      attendance_recorded_at=NULL,
      completed_at=NULL
    WHERE id=${sessionId}::uuid
      AND deleted_at IS NULL
  `;
  await sql`DELETE FROM training_attendance WHERE session_id=${sessionId}::uuid`;

  await sql`
    UPDATE club_events e
    SET
      title='Vereinstraining · ABGESAGT',
      description='Training abgesagt',
      updated_at=now()
    FROM training_sessions s
    WHERE s.id=${sessionId}::uuid
      AND s.deleted_at IS NULL
      AND e.id=s.event_id
      AND e.deleted_at IS NULL
  `;

  await writeAudit(actor.id,"training.cancelled","training_session",sessionId);

  revalidateTraining(sessionId);
  redirect(`/training/${sessionId}?cancelled=1`);
}

export async function restoreTrainingSessionAction(formData: FormData) {
  const actor = await requirePermission("training.write");
  const sql = getDb();
  if (!sql) redirect("/training?error=database");

  const sessionId=value(formData,"sessionId");
  if (!sessionId) redirect("/training?error=missing");

  await sql`
    UPDATE training_sessions
    SET status='planned'
    WHERE id=${sessionId}::uuid
      AND deleted_at IS NULL
  `;

  await sql`
    UPDATE club_events e
    SET
      title=CASE WHEN s.source='special' THEN 'Sondertraining' ELSE 'Vereinstraining' END,
      description=CASE
        WHEN s.source='special' THEN COALESCE(s.notes,'Sondertraining · Ende offen')
        ELSE 'Regeltraining · Beginn 19:00 Uhr · Ende offen'
      END,
      updated_at=now()
    FROM training_sessions s
    WHERE s.id=${sessionId}::uuid
      AND e.id=s.event_id
  `;

  await writeAudit(actor.id,"training.restored","training_session",sessionId);

  revalidateTraining(sessionId);
  redirect(`/training/${sessionId}?restored=1`);
}

export async function refreshTrainingScheduleAction() {
  await requirePermission("training.write");
  await ensureTrainingSchedule(365);
  revalidateTraining();
  redirect("/training?refreshed=1");
}

export async function createSpecialTrainingAction(formData: FormData) {
  const actor=await requirePermission("training.write");
  const sql=getDb();
  if (!sql) redirect("/training?error=database");

  const date=value(formData,"date");
  const time=value(formData,"time") || "19:00";
  const note=value(formData,"note");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    redirect("/training?error=special");
  }

  const startsAt=`${date} ${time} Europe/Berlin`;

  const existing=await sql`
    SELECT id::text
    FROM training_sessions
    WHERE scheduled_at=${startsAt}::timestamptz
    LIMIT 1
  `;
  if (existing.length) redirect("/training?error=duplicate_training");

  const sessionRows=await sql`
    INSERT INTO training_sessions (
      scheduled_at,status,source,notes
    )
    VALUES (
      ${startsAt}::timestamptz,'planned','special',${note || null}
    )
    RETURNING id::text
  `;
  const sessionId=String(sessionRows[0]?.id ?? "");
  if (!sessionId) redirect("/training?error=special");

  const eventRows=await sql`
    INSERT INTO club_events (
      title,event_type,starts_at,ends_at,source,external_id,description
    )
    VALUES (
      'Sondertraining','training',${startsAt}::timestamptz,NULL,
      'training_schedule','training-session:' || ${sessionId},
      ${note || "Sondertraining · Ende offen"}
    )
    RETURNING id::text
  `;

  if (eventRows[0]?.id) {
    await sql`
      UPDATE training_sessions
      SET event_id=${String(eventRows[0].id)}::uuid
      WHERE id=${sessionId}::uuid
    `;
  }

  await writeAudit(actor.id,"training.special_created","training_session",sessionId,{
    date,time,note:Boolean(note),
  });

  revalidateTraining(sessionId);
  redirect(`/training/${sessionId}?created=1`);
}

export async function createTrainingPauseAction(formData: FormData) {
  const actor=await requirePermission("training.write");
  const sql=getDb();
  if (!sql) redirect("/training?error=database");

  const startsOn=value(formData,"startsOn");
  const endsOn=value(formData,"endsOn");
  const reason=value(formData,"reason");

  if (!startsOn || !endsOn || endsOn < startsOn) {
    redirect("/training?error=pause");
  }

  const rows=await sql`
    INSERT INTO training_blackouts (starts_on,ends_on,reason,created_by)
    VALUES (
      ${startsOn}::date,${endsOn}::date,${reason || null},${actor.id}::uuid
    )
    RETURNING id::text
  `;
  const pauseId=String(rows[0]?.id ?? "");

  await sql`
    UPDATE training_sessions
    SET
      status='cancelled',
      notes=${"pause:" + pauseId + "|" + (reason || "Trainingspause")},
      attendance_recorded_at=NULL,
      completed_at=NULL
    WHERE source='schedule'
      AND deleted_at IS NULL
      AND (scheduled_at AT TIME ZONE 'Europe/Berlin')::date
          BETWEEN ${startsOn}::date AND ${endsOn}::date
      AND scheduled_at>=now()
  `;

  await sql`
    UPDATE club_events e
    SET
      title='Vereinstraining · PAUSE',
      description=${reason || "Trainingspause"},
      updated_at=now()
    FROM training_sessions s
    WHERE s.event_id=e.id
      AND s.deleted_at IS NULL
      AND s.notes LIKE ${"pause:" + pauseId + "|%"}
  `;

  await writeAudit(actor.id,"training.pause_created","training_pause",pauseId,{
    startsOn,endsOn,reason:reason || null,
  });

  revalidateTraining();
  redirect("/training?pause=1");
}

export async function deleteTrainingPauseAction(formData: FormData) {
  const actor=await requirePermission("training.write");
  const sql=getDb();
  if (!sql) redirect("/training?error=database");

  const pauseId=value(formData,"pauseId");
  if (!pauseId) redirect("/training?error=pause");

  const pauseRows=await sql`
    SELECT id::text,starts_on,ends_on,reason
    FROM training_blackouts
    WHERE id=${pauseId}::uuid
    LIMIT 1
  `;
  const pause=pauseRows[0];
  if (!pause) redirect("/training?error=pause");

  await sql`
    UPDATE training_sessions
    SET status='planned',notes=NULL
    WHERE source='schedule'
      AND deleted_at IS NULL
      AND notes LIKE ${"pause:" + pauseId + "|%"}
  `;

  await sql`
    UPDATE club_events e
    SET
      title='Vereinstraining',
      description='Regeltraining · Beginn 19:00 Uhr · Ende offen',
      updated_at=now()
    FROM training_sessions s
    WHERE s.event_id=e.id
      AND s.deleted_at IS NULL
      AND s.source='schedule'
      AND (s.scheduled_at AT TIME ZONE 'Europe/Berlin')::date
          BETWEEN ${String(pause.starts_on)}::date AND ${String(pause.ends_on)}::date
  `;

  await sql`DELETE FROM training_blackouts WHERE id=${pauseId}::uuid`;
  await ensureTrainingSchedule(365);

  await writeAudit(actor.id,"training.pause_deleted","training_pause",pauseId,{
    startsOn:String(pause.starts_on),
    endsOn:String(pause.ends_on),
  });

  revalidateTraining();
  redirect("/training?pause_removed=1");
}
