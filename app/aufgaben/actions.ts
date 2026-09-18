"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

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

export async function updateTaskStatusAction(formData: FormData) {
  await requirePermission("tasks.write");
  const sql = getDb();
  if (!sql) redirect("/aufgaben?error=database");

  const id = value(formData, "id");
  const statusRaw = value(formData, "status");
  const status = allowedStatuses.has(statusRaw) ? statusRaw : "open";

  if (!id) redirect("/aufgaben?error=missing");

  await sql`
    UPDATE tasks
    SET
      status = ${status},
      completed_at = CASE WHEN ${status} = 'done' THEN now() ELSE NULL END
    WHERE id = ${id}::uuid
  `;

  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect("/aufgaben");
}
