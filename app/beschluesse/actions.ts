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

  const beforeRows=await sql`
    SELECT id::text,title,status
    FROM resolutions
    WHERE id=${id}::uuid
    LIMIT 1
  `;
  const before=beforeRows[0];
  if (!before) redirect("/beschluesse?error=missing");

  if (before.status==="withdrawn" && status!=="withdrawn") {
    redirect("/beschluesse?error=withdrawn");
  }
  if (before.status==="rejected") {
    redirect("/beschluesse?error=rejected");
  }

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
        AND deleted_at IS NULL
        AND status<>'cancelled'
    `;
  } else if (status==="withdrawn") {
    await sql`
      UPDATE tasks
      SET status='cancelled',completed_at=NULL
      WHERE source_type='resolution'
        AND source_id=${id}::uuid
        AND deleted_at IS NULL
        AND status<>'done'
    `;
  } else if (status==="in_progress") {
    await sql`
      UPDATE tasks
      SET status='in_progress',completed_at=NULL
      WHERE source_type='resolution'
        AND source_id=${id}::uuid
        AND deleted_at IS NULL
        AND status NOT IN ('done','cancelled')
    `;
  } else if (status==="open") {
    await sql`
      UPDATE tasks
      SET status='open',completed_at=NULL
      WHERE source_type='resolution'
        AND source_id=${id}::uuid
        AND deleted_at IS NULL
        AND status NOT IN ('done','cancelled')
    `;
  }

  await writeAudit(actor.id,"resolution.status_changed","resolution",id,{
    title:String(before.title ?? ""),
    before:String(before.status ?? ""),
    after:status,
  });

  revalidatePath("/beschluesse");
  revalidatePath("/aufgaben");
  revalidatePath("/hinweise");
  revalidatePath("/");
  redirect("/beschluesse?saved=1");
}

export async function updateResolutionImplementationAction(formData: FormData) {
  const actor=await requirePermission("resolutions.write");
  const sql=getDb();
  if (!sql) redirect("/beschluesse?error=database");

  const id=value(formData,"id");
  const implementationNotes=value(formData,"implementationNotes");
  if (!id) redirect("/beschluesse?error=missing");

  const rows=await sql`
    UPDATE resolutions
    SET implementation_notes=${implementationNotes || null}
    WHERE id=${id}::uuid
    RETURNING title
  `;

  if (!rows.length) redirect("/beschluesse?error=missing");

  await writeAudit(actor.id,"resolution.implementation_updated","resolution",id,{
    title:String(rows[0].title),
    hasNotes:Boolean(implementationNotes),
  });

  revalidatePath("/beschluesse");
  revalidatePath("/hinweise");
  redirect("/beschluesse?saved=1");
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
    WHERE EXISTS (
      SELECT 1 FROM resolutions r
      WHERE r.id=${resolutionId}::uuid
        AND COALESCE(r.decision_outcome,'accepted')='accepted'
        AND r.status<>'rejected'
    )
    AND NOT EXISTS (
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
