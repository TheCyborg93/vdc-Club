"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createBoardPositionAction(formData: FormData) {
  await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/vorstand?error=database");

  const memberId = value(formData, "memberId");
  const title = value(formData, "title");
  const roleKey = value(formData, "roleKey");
  const startDate = value(formData, "startDate");

  if (!memberId || !title || !startDate) redirect("/vorstand?error=missing");

  await sql`
    INSERT INTO board_positions (member_id, title, role_key, start_date, is_active)
    VALUES (
      ${memberId}::uuid,
      ${title},
      ${roleKey || null},
      ${startDate}::date,
      true
    )
  `;

  if (roleKey) {
    await sql`
      INSERT INTO user_roles (user_id, role_key)
      SELECT id, ${roleKey}
      FROM app_users
      WHERE member_id = ${memberId}::uuid
      ON CONFLICT DO NOTHING
    `;
  }

  revalidatePath("/vorstand");
  redirect("/vorstand?created=1");
}

export async function endBoardPositionAction(formData: FormData) {
  await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/vorstand?error=database");

  const id = value(formData, "id");
  if (!id) redirect("/vorstand?error=missing");

  await sql`
    UPDATE board_positions
    SET is_active = false, end_date = CURRENT_DATE
    WHERE id = ${id}::uuid
  `;

  revalidatePath("/vorstand");
  redirect("/vorstand?ended=1");
}
