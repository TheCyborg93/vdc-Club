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
  const sourceSystem=value(formData,"sourceSystem")==="v3" ? "v3" : "legacy";
  const statusRaw=value(formData,"status");
  const status=["open","in_progress","implemented","withdrawn"].includes(statusRaw)
    ? statusRaw
    : "open";

  if (!id) redirect("/beschluesse?error=missing");

  const beforeRows=sourceSystem==="v3"
    ? await sql`
        SELECT id::text,title,implementation_status AS status,decision_outcome
        FROM meeting_v3_resolutions
        WHERE id=${id}::uuid
        LIMIT 1
      `
    : await sql`
        SELECT id::text,title,status,decision_outcome
        FROM resolutions
        WHERE id=${id}::uuid
        LIMIT 1
      `;
  const before=beforeRows[0];
  if (!before) redirect("/beschluesse?error=missing");

  if (before.decision_outcome==="rejected") {
    redirect("/beschluesse?error=rejected");
  }
  if (before.status==="withdrawn" && status!=="withdrawn") {
    redirect("/beschluesse?error=withdrawn");
  }

  if(sourceSystem==="v3"){
    await sql`
      UPDATE meeting_v3_resolutions
      SET
        implementation_status=${status},
        implemented_at=CASE
          WHEN ${status}='implemented' THEN COALESCE(implemented_at,now())
          ELSE NULL
        END
      WHERE id=${id}::uuid
    `;
  }else{
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
  }

  const taskSource=sourceSystem==="v3" ? "meeting_v3_resolution" : "resolution";
  if (status==="implemented") {
    await sql`
      UPDATE tasks
      SET status='done',completed_at=COALESCE(completed_at,now())
      WHERE source_type=${taskSource}
        AND source_id=${id}::uuid
        AND deleted_at IS NULL
        AND status<>'cancelled'
    `;
  } else if (status==="withdrawn") {
    await sql`
      UPDATE tasks
      SET status='cancelled',completed_at=NULL
      WHERE source_type=${taskSource}
        AND source_id=${id}::uuid
        AND deleted_at IS NULL
        AND status<>'done'
    `;
  } else if (status==="in_progress") {
    await sql`
      UPDATE tasks
      SET status='in_progress',completed_at=NULL
      WHERE source_type=${taskSource}
        AND source_id=${id}::uuid
        AND deleted_at IS NULL
        AND status<>'cancelled'
    `;
  } else if (status==="open") {
    await sql`
      UPDATE tasks
      SET status='open',completed_at=NULL
      WHERE source_type=${taskSource}
        AND source_id=${id}::uuid
        AND deleted_at IS NULL
        AND status<>'cancelled'
    `;
  }

  await writeAudit(actor.id,"resolution.status_changed",sourceSystem==="v3" ? "meeting_v3_resolution" : "resolution",id,{
    sourceSystem,
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
  const sourceSystem=value(formData,"sourceSystem")==="v3" ? "v3" : "legacy";
  const implementationNotes=value(formData,"implementationNotes");
  if (!id) redirect("/beschluesse?error=missing");

  const rows=sourceSystem==="v3"
    ? await sql`
        UPDATE meeting_v3_resolutions
        SET implementation_notes=${implementationNotes || null}
        WHERE id=${id}::uuid
          AND decision_outcome<>'rejected'
        RETURNING title
      `
    : await sql`
        UPDATE resolutions
        SET implementation_notes=${implementationNotes || null}
        WHERE id=${id}::uuid
          AND COALESCE(decision_outcome,'accepted')<>'rejected'
        RETURNING title
      `;

  if (!rows.length) redirect("/beschluesse?error=missing");

  await writeAudit(actor.id,"resolution.implementation_updated",sourceSystem==="v3" ? "meeting_v3_resolution" : "resolution",id,{
    sourceSystem,
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
  const sourceSystem=value(formData,"sourceSystem")==="v3" ? "v3" : "legacy";
  const title=value(formData,"title");
  const ownerMemberId=value(formData,"ownerMemberId");
  const dueDate=value(formData,"dueDate");
  const description=value(formData,"description");

  if (!resolutionId || !title) redirect("/beschluesse?error=missing");

  const taskSource=sourceSystem==="v3" ? "meeting_v3_resolution" : "resolution";
  const rows=sourceSystem==="v3"
    ? await sql`
        INSERT INTO tasks (
          title,description,category,status,priority,
          due_date,owner_member_id,source_type,source_id
        )
        SELECT
          ${title},${description || null},'Beschluss','open','medium',
          ${dueDate || null}::date,${ownerMemberId || null}::uuid,
          ${taskSource},${resolutionId}::uuid
        WHERE EXISTS (
          SELECT 1 FROM meeting_v3_resolutions r
          WHERE r.id=${resolutionId}::uuid
            AND r.decision_outcome='accepted'
            AND r.implementation_status NOT IN ('implemented','withdrawn')
        )
        AND NOT EXISTS (
          SELECT 1 FROM tasks
          WHERE source_type=${taskSource}
            AND source_id=${resolutionId}::uuid
            AND status<>'cancelled'
            AND deleted_at IS NULL
        )
        RETURNING id::text
      `
    : await sql`
        INSERT INTO tasks (
          title,description,category,status,priority,
          due_date,owner_member_id,source_type,source_id
        )
        SELECT
          ${title},${description || null},'Beschluss','open','medium',
          ${dueDate || null}::date,${ownerMemberId || null}::uuid,
          ${taskSource},${resolutionId}::uuid
        WHERE EXISTS (
          SELECT 1 FROM resolutions r
          WHERE r.id=${resolutionId}::uuid
            AND COALESCE(r.decision_outcome,'accepted')='accepted'
            AND r.status NOT IN ('implemented','withdrawn')
        )
        AND NOT EXISTS (
          SELECT 1 FROM tasks
          WHERE source_type=${taskSource}
            AND source_id=${resolutionId}::uuid
            AND status<>'cancelled'
            AND deleted_at IS NULL
        )
        RETURNING id::text
      `;

  if (!rows.length) {
    redirect("/beschluesse?error=task_unavailable");
  }

  if(sourceSystem==="v3"){
    await sql`
      UPDATE meeting_v3_resolutions
      SET implementation_status='in_progress'
      WHERE id=${resolutionId}::uuid
        AND implementation_status='open'
    `;
  }else{
    await sql`
      UPDATE resolutions
      SET status='in_progress'
      WHERE id=${resolutionId}::uuid
        AND status='open'
    `;
  }

  await writeAudit(actor.id,"resolution.task_created",sourceSystem==="v3" ? "meeting_v3_resolution" : "resolution",resolutionId,{
    sourceSystem,
    taskId:String(rows[0].id),
    ownerMemberId:ownerMemberId || null,
    dueDate:dueDate || null,
  });

  revalidatePath("/beschluesse");
  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect("/beschluesse?task=1");
}
