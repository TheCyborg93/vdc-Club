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

export async function saveTrainingAttendanceAction(formData: FormData) {
  const actor = await requirePermission("training.write");
  const sql = getDb();
  if (!sql) redirect("/training?error=database");

  const sessionId = value(formData,"sessionId");
  if (!sessionId) redirect("/training?error=missing");

  const sessionRows = await sql`
    SELECT id::text,scheduled_at,status
    FROM training_sessions
    WHERE id=${sessionId}::uuid
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
      attendance_recorded_at=now(),
      completed_at=COALESCE(completed_at,now())
    WHERE id=${sessionId}::uuid
  `;

  const present = rows.filter((row)=>row.attendance==="present").length;
  const excused = rows.filter((row)=>row.attendance==="excused").length;

  await writeAudit(actor.id,"training.attendance_saved","training_session",sessionId,{
    present,
    absent:rows.length-present-excused,
    excused,
  });

  revalidatePath("/training");
  revalidatePath(`/training/${sessionId}`);
  revalidatePath("/statistik");
  revalidatePath("/");
  redirect(`/training/${sessionId}?saved=1`);
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
      AND e.id=s.event_id
  `;

  await writeAudit(actor.id,"training.cancelled","training_session",sessionId);

  revalidatePath("/training");
  revalidatePath(`/training/${sessionId}`);
  revalidatePath("/kalender");
  revalidatePath("/");
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
  `;

  await sql`
    UPDATE club_events e
    SET
      title='Vereinstraining',
      description='Regeltraining · Beginn 19:00 Uhr · Ende offen',
      updated_at=now()
    FROM training_sessions s
    WHERE s.id=${sessionId}::uuid
      AND e.id=s.event_id
  `;

  await writeAudit(actor.id,"training.restored","training_session",sessionId);

  revalidatePath("/training");
  revalidatePath(`/training/${sessionId}`);
  revalidatePath("/kalender");
  redirect(`/training/${sessionId}?restored=1`);
}

export async function refreshTrainingScheduleAction() {
  await requirePermission("training.write");
  await ensureTrainingSchedule(365);
  revalidatePath("/training");
  revalidatePath("/kalender");
  redirect("/training?refreshed=1");
}
