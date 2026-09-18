"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function updateResolutionStatusAction(formData: FormData) {
  const actor=await requirePermission("resolutions.write");
  const sql=getDb();
  if (!sql) redirect("/beschluesse?error=database");

  const id=value(formData,"id");
  const statusRaw=value(formData,"status");
  const status=["open","in_progress","implemented","withdrawn"].includes(statusRaw)
    ? statusRaw
    : "open";

  if (!id) redirect("/beschluesse?error=missing");

  const before=await sql`
    SELECT id::text,title,status
    FROM resolutions
    WHERE id=${id}::uuid
    LIMIT 1
  `;

  await sql`
    UPDATE resolutions
    SET
      status=${status},
      implemented_at=CASE
        WHEN ${status}='implemented' THEN COALESCE(implemented_at,now())
        ELSE NULL
      END
    WHERE id=${id}::uuid
  `;

  if (status==="implemented") {
    await sql`
      UPDATE tasks
      SET status='done',completed_at=COALESCE(completed_at,now())
      WHERE source_type='resolution'
        AND source_id=${id}::uuid
        AND status NOT IN ('done','cancelled')
    `;
  }

  await writeAudit(actor.id,"resolution.status_changed","resolution",id,{
    title:String(before[0]?.title ?? ""),
    before:String(before[0]?.status ?? ""),
    after:status,
  });

  revalidatePath("/beschluesse");
  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect("/beschluesse");
}

export async function createResolutionTaskAction(formData: FormData) {
  const actor=await requirePermission("tasks.write");
  const sql=getDb();
  if (!sql) redirect("/beschluesse?error=database");

  const resolutionId=value(formData,"resolutionId");
  const title=value(formData,"title");
  const ownerMemberId=value(formData,"ownerMemberId");
  const dueDate=value(formData,"dueDate");
  const description=value(formData,"description");

  if (!resolutionId || !title) redirect("/beschluesse?error=missing");

  const rows=await sql`
    INSERT INTO tasks (
      title,description,category,status,priority,
      due_date,owner_member_id,source_type,source_id
    )
    SELECT
      ${title},
      ${description || null},
      'Beschluss',
      'open',
      'medium',
      ${dueDate || null}::date,
      ${ownerMemberId || null}::uuid,
      'resolution',
      ${resolutionId}::uuid
    WHERE NOT EXISTS (
      SELECT 1
      FROM tasks
      WHERE source_type='resolution'
        AND source_id=${resolutionId}::uuid
        AND status<>'cancelled'
    )
    RETURNING id::text
  `;

  if (rows.length) {
    await sql`
      UPDATE resolutions
      SET status='in_progress'
      WHERE id=${resolutionId}::uuid
        AND status='open'
    `;

    await writeAudit(actor.id,"resolution.task_created","resolution",resolutionId,{
      taskId:String(rows[0].id),
      ownerMemberId:ownerMemberId || null,
      dueDate:dueDate || null,
    });
  }

  revalidatePath("/beschluesse");
  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect("/beschluesse?task=1");
}
