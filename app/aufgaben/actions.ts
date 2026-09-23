"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const allowedStatuses = new Set(["open", "in_progress", "blocked", "done", "cancelled"]);
const allowedPriorities = new Set(["low", "medium", "high", "urgent"]);

export async function createTaskAction(formData: FormData) {
  await requirePermission("tasks.write");
  const sql = getDb();
  if (!sql) redirect("/aufgaben?error=database");

  const title = value(formData, "title");
  const description = value(formData, "description");
  const category = value(formData, "category");
  const priorityRaw = value(formData, "priority");
  const priority = allowedPriorities.has(priorityRaw) ? priorityRaw : "medium";
  const dueDate = value(formData, "dueDate");
  const ownerMemberId = value(formData, "ownerMemberId");

  if (!title) redirect("/aufgaben?error=missing");

  await sql`
    INSERT INTO tasks (
      title, description, category, priority, due_date, owner_member_id, status
    )
    VALUES (
      ${title},
      ${description || null},
      ${category || null},
      ${priority},
      ${dueDate || null}::date,
      ${ownerMemberId || null}::uuid,
      'open'
    )
  `;

  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect("/aufgaben?created=1");
}

export async function updateTaskDetailsAction(formData: FormData) {
  const actor=await requirePermission("tasks.write");
  const sql=getDb();
  if (!sql) redirect("/aufgaben?error=database");

  const id=value(formData,"id");
  const title=value(formData,"title");
  const description=value(formData,"description");
  const category=value(formData,"category");
  const priorityRaw=value(formData,"priority");
  const priority=allowedPriorities.has(priorityRaw) ? priorityRaw : "medium";
  const dueDate=value(formData,"dueDate");
  const ownerMemberId=value(formData,"ownerMemberId");

  if (!id || !title) redirect("/aufgaben?error=missing");

  const beforeRows=await sql`
    SELECT
      id::text,title,description,category,priority,due_date::text,
      owner_member_id::text,source_type,source_id::text
    FROM tasks
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const before=beforeRows[0];
  if (!before) redirect("/aufgaben?error=missing");

  const rows=await sql`
    UPDATE tasks
    SET
      title=${title},
      description=${description || null},
      category=${category || null},
      priority=${priority},
      due_date=${dueDate || null}::date,
      owner_member_id=${ownerMemberId || null}::uuid,
      updated_at=now()
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    RETURNING
      title,description,category,priority,due_date::text,
      owner_member_id::text
  `;
  const after=rows[0];
  if (!after) redirect("/aufgaben?error=missing");

  await writeAudit(actor.id,"task.details_updated","task",id,{
    before,
    after,
  });

  revalidatePath("/aufgaben");
  revalidatePath("/beschluesse");
  revalidatePath("/hinweise");
  revalidatePath("/");
  redirect("/aufgaben?saved=1");
}

export async function updateTaskStatusAction(formData: FormData) {
  const actor=await requirePermission("tasks.write");
  const sql=getDb();
  if (!sql) redirect("/aufgaben?error=database");

  const id=value(formData,"id");
  const statusRaw=value(formData,"status");
  const status=allowedStatuses.has(statusRaw) ? statusRaw : "open";

  if (!id) redirect("/aufgaben?error=missing");

  const before=await sql`
    SELECT id::text,title,status,source_type,source_id::text
    FROM tasks
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;

  await sql`
    UPDATE tasks
    SET
      status=${status},
      completed_at=CASE WHEN ${status}='done' THEN COALESCE(completed_at,now()) ELSE NULL END
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
  `;

  const task=before[0];
  if (task?.source_type==="resolution" && task.source_id) {
    if (status==="done") {
      await sql`
        UPDATE resolutions
        SET status='implemented',implemented_at=COALESCE(implemented_at,now())
        WHERE id=${String(task.source_id)}::uuid
          AND status<>'withdrawn'
      `;
    } else if (["in_progress","blocked"].includes(status)) {
      await sql`
        UPDATE resolutions
        SET status='in_progress',implemented_at=NULL
        WHERE id=${String(task.source_id)}::uuid
          AND status<>'withdrawn'
      `;
    } else if (status==="open") {
      await sql`
        UPDATE resolutions
        SET status='open',implemented_at=NULL
        WHERE id=${String(task.source_id)}::uuid
          AND status<>'withdrawn'
      `;
    }

    revalidatePath("/beschluesse");
  }

  if (task?.source_type==="meeting_v3_resolution" && task.source_id) {
    if (status==="done") {
      await sql`
        UPDATE meeting_v3_resolutions
        SET implementation_status='implemented',implemented_at=COALESCE(implemented_at,now())
        WHERE id=${String(task.source_id)}::uuid
          AND implementation_status<>'withdrawn'
      `;
    } else if (["in_progress","blocked"].includes(status)) {
      await sql`
        UPDATE meeting_v3_resolutions
        SET implementation_status='in_progress',implemented_at=NULL
        WHERE id=${String(task.source_id)}::uuid
          AND implementation_status<>'withdrawn'
      `;
    } else if (status==="open") {
      await sql`
        UPDATE meeting_v3_resolutions
        SET implementation_status='open',implemented_at=NULL
        WHERE id=${String(task.source_id)}::uuid
          AND implementation_status<>'withdrawn'
      `;
    }
    revalidatePath("/sitzungen-neu");
  }

  await writeAudit(actor.id,"task.status_changed","task",id,{
    title:String(task?.title ?? ""),
    before:String(task?.status ?? ""),
    after:status,
    sourceType:String(task?.source_type ?? ""),
    sourceId:task?.source_id ? String(task.source_id) : null,
  });

  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect("/aufgaben");
}


export async function updateTaskStatusInlineAction(formData: FormData) {
  const actor=await requirePermission("tasks.write");
  const sql=getDb();
  if (!sql) return;

  const id=value(formData,"id");
  const statusRaw=value(formData,"status");
  const status=allowedStatuses.has(statusRaw) ? statusRaw : "open";
  if (!id) return;

  const before=await sql`
    SELECT id::text,title,status,source_type,source_id::text
    FROM tasks
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const task=before[0];
  if (!task) return;

  await sql`
    UPDATE tasks
    SET
      status=${status},
      completed_at=CASE
        WHEN ${status}='done' THEN COALESCE(completed_at,now())
        ELSE NULL
      END
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
  `;

  if (task.source_type==="resolution" && task.source_id) {
    if (status==="done") {
      await sql`
        UPDATE resolutions
        SET status='implemented',implemented_at=COALESCE(implemented_at,now())
        WHERE id=${String(task.source_id)}::uuid
          AND status<>'withdrawn'
      `;
    } else if (["in_progress","blocked"].includes(status)) {
      await sql`
        UPDATE resolutions
        SET status='in_progress',implemented_at=NULL
        WHERE id=${String(task.source_id)}::uuid
          AND status<>'withdrawn'
      `;
    } else if (status==="open") {
      await sql`
        UPDATE resolutions
        SET status='open',implemented_at=NULL
        WHERE id=${String(task.source_id)}::uuid
          AND status<>'withdrawn'
      `;
    }
    revalidatePath("/beschluesse");
  }

  if (task.source_type==="meeting_v3_resolution" && task.source_id) {
    if (status==="done") {
      await sql`
        UPDATE meeting_v3_resolutions
        SET implementation_status='implemented',implemented_at=COALESCE(implemented_at,now())
        WHERE id=${String(task.source_id)}::uuid
          AND implementation_status<>'withdrawn'
      `;
    } else if (["in_progress","blocked"].includes(status)) {
      await sql`
        UPDATE meeting_v3_resolutions
        SET implementation_status='in_progress',implemented_at=NULL
        WHERE id=${String(task.source_id)}::uuid
          AND implementation_status<>'withdrawn'
      `;
    } else if (status==="open") {
      await sql`
        UPDATE meeting_v3_resolutions
        SET implementation_status='open',implemented_at=NULL
        WHERE id=${String(task.source_id)}::uuid
          AND implementation_status<>'withdrawn'
      `;
    }
    revalidatePath("/sitzungen-neu");
  }

  await writeAudit(actor.id,"task.status_changed","task",id,{
    title:String(task.title ?? ""),
    before:String(task.status ?? ""),
    after:status,
    sourceType:String(task.source_type ?? ""),
    sourceId:task.source_id ? String(task.source_id) : null,
    source:"dashboard",
  });

  revalidatePath("/aufgaben");
  revalidatePath("/");
  revalidatePath("/hinweise");
}
