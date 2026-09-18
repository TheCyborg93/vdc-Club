"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createDocumentAction(formData: FormData) {
  await requirePermission("documents.write");
  const sql = getDb();
  if (!sql) redirect("/dokumente?error=database");

  const title = value(formData, "title");
  const category = value(formData, "category");
  const storageRef = value(formData, "storageRef");
  const validUntil = value(formData, "validUntil");
  const notes = value(formData, "notes");
  const meetingId = value(formData, "meetingId");
  const resolutionId = value(formData, "resolutionId");
  const memberId = value(formData, "memberId");
  const financeEntryId = value(formData, "financeEntryId");

  if (!title || !category) redirect("/dokumente?error=missing");

  await sql`
    INSERT INTO documents (
      title, category, storage_type, storage_ref, status, valid_until, notes,
      meeting_id, resolution_id, member_id, finance_entry_id
    )
    VALUES (
      ${title},
      ${category},
      'link',
      ${storageRef || null},
      'active',
      ${validUntil || null}::date,
      ${notes || null},
      ${meetingId || null}::uuid,
      ${resolutionId || null}::uuid,
      ${memberId || null}::uuid,
      ${financeEntryId || null}::uuid
    )
  `;

  revalidatePath("/dokumente");
  redirect("/dokumente?created=1");
}

export async function updateDocumentStatusAction(formData: FormData) {
  await requirePermission("documents.write");
  const sql = getDb();
  if (!sql) redirect("/dokumente?error=database");

  const id = value(formData, "id");
  const status = value(formData, "status");
  if (!id || !["active","review","archived","expired"].includes(status)) {
    redirect("/dokumente?error=invalid");
  }

  await sql`
    UPDATE documents
    SET status = ${status}
    WHERE id = ${id}::uuid
  `;

  revalidatePath("/dokumente");
  redirect("/dokumente");
}

export async function deleteDocumentAction(formData: FormData) {
  await requirePermission("documents.write");
  const sql = getDb();
  if (!sql) redirect("/dokumente?error=database");

  const id = value(formData, "id");
  if (!id) redirect("/dokumente?error=invalid");

  await sql`DELETE FROM documents WHERE id = ${id}::uuid`;

  revalidatePath("/dokumente");
  redirect("/dokumente?deleted=1");
}
