"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function updateResolutionStatusAction(formData: FormData) {
  await requirePermission("resolutions.write");
  const sql = getDb();
  if (!sql) redirect("/beschluesse?error=database");

  const id = value(formData, "id");
  const statusRaw = value(formData, "status");
  const status = ["open", "in_progress", "implemented", "withdrawn"].includes(statusRaw)
    ? statusRaw
    : "open";

  if (!id) redirect("/beschluesse?error=missing");

  await sql`
    UPDATE resolutions
    SET status = ${status}
    WHERE id = ${id}::uuid
  `;

  revalidatePath("/beschluesse");
  revalidatePath("/");
  redirect("/beschluesse");
}

export async function createResolutionTaskAction(formData: FormData) {
  await requirePermission("tasks.write");
  const sql = getDb();
  if (!sql) redirect("/beschluesse?error=database");

  const resolutionId = value(formData, "resolutionId");
  const title = value(formData, "title");
  const ownerMemberId = value(formData, "ownerMemberId");
  const dueDate = value(formData, "dueDate");
  const description = value(formData, "description");

  if (!resolutionId || !title) redirect("/beschluesse?error=missing");

  await sql`
    INSERT INTO tasks (
      title, description, category, status, priority,
      due_date, owner_member_id, source_type, source_id
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
      WHERE source_type = 'resolution'
        AND source_id = ${resolutionId}::uuid
        AND status <> 'cancelled'
    )
  `;

  revalidatePath("/beschluesse");
  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect("/beschluesse?task=1");
}
