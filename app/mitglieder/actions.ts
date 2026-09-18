"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";

const allowedRoles = new Set([
  "admin", "board", "chair", "vice_chair", "treasurer",
  "secretary", "sport_director", "team_captain", "tournament_director",
]);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createMemberAction(formData: FormData) {
  await requirePermission("members.write");
  const sql = getDb();
  if (!sql) redirect("/mitglieder?error=database");

  const firstName = value(formData, "firstName");
  const lastName = value(formData, "lastName");
  const email = value(formData, "email").toLowerCase();
  const memberNumber = value(formData, "memberNumber");
  const joinDate = value(formData, "joinDate");
  const status = value(formData, "status") || "active";

  if (!firstName || !lastName) redirect("/mitglieder?error=missing");

  try {
    await sql`
      INSERT INTO members (
        first_name, last_name, email, member_number, join_date, status
      )
      VALUES (
        ${firstName},
        ${lastName},
        ${email || null},
        ${memberNumber || null},
        ${joinDate || null}::date,
        ${status}
      )
    `;
  } catch {
    redirect("/mitglieder?error=duplicate");
  }

  revalidatePath("/mitglieder");
  redirect("/mitglieder?created=1");
}

export async function updateMemberAction(formData: FormData) {
  await requirePermission("members.write");
  const sql = getDb();
  if (!sql) redirect("/mitglieder?error=database");

  const id = value(formData, "id");
  const firstName = value(formData, "firstName");
  const lastName = value(formData, "lastName");
  const email = value(formData, "email").toLowerCase();
  const phone = value(formData, "phone");
  const memberNumber = value(formData, "memberNumber");
  const birthDate = value(formData, "birthDate");
  const joinDate = value(formData, "joinDate");
  const status = value(formData, "status");
  const notes = value(formData, "notes");

  if (!id || !firstName || !lastName) redirect(`/mitglieder/${id}?error=missing`);

  await sql`
    UPDATE members
    SET
      first_name = ${firstName},
      last_name = ${lastName},
      email = ${email || null},
      phone = ${phone || null},
      member_number = ${memberNumber || null},
      birth_date = ${birthDate || null}::date,
      join_date = ${joinDate || null}::date,
      status = ${status || "active"},
      notes = ${notes || null}
    WHERE id = ${id}::uuid
  `;

  revalidatePath("/mitglieder");
  revalidatePath(`/mitglieder/${id}`);
  redirect(`/mitglieder/${id}?saved=1`);
}

export async function createMemberAccountAction(formData: FormData) {
  await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/mitglieder?error=database");

  const memberId = value(formData, "memberId");
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const selectedRoles = formData
    .getAll("roles")
    .map(String)
    .filter((role) => allowedRoles.has(role));

  if (!memberId || !email || password.length < 12) {
    redirect(`/mitglieder/${memberId}?error=account`);
  }

  const passwordHash = hashPassword(password);

  let rows;
  try {
    rows = await sql`
      INSERT INTO app_users (
        member_id, email, display_name, password_hash, password_changed_at, status
      )
      SELECT
        id,
        ${email},
        first_name || ' ' || last_name,
        ${passwordHash},
        now(),
        'active'
      FROM members
      WHERE id = ${memberId}::uuid
      RETURNING id::text
    `;
  } catch {
    redirect(`/mitglieder/${memberId}?error=account_exists`);
  }

  const userId = String(rows[0]?.id ?? "");
  if (!userId) redirect(`/mitglieder/${memberId}?error=account`);

  for (const role of selectedRoles) {
    await sql`
      INSERT INTO user_roles (user_id, role_key)
      VALUES (${userId}::uuid, ${role})
      ON CONFLICT DO NOTHING
    `;
  }

  revalidatePath(`/mitglieder/${memberId}`);
  redirect(`/mitglieder/${memberId}?account=1`);
}

export async function updateMemberRolesAction(formData: FormData) {
  const actor = await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/mitglieder?error=database");

  const memberId = value(formData, "memberId");
  const userId = value(formData, "userId");
  const selectedRoles = formData
    .getAll("roles")
    .map(String)
    .filter((role) => allowedRoles.has(role));

  const roles = new Set(selectedRoles);
  if (userId === actor.id) roles.add("admin");

  await sql`DELETE FROM user_roles WHERE user_id = ${userId}::uuid`;

  for (const role of roles) {
    await sql`
      INSERT INTO user_roles (user_id, role_key)
      VALUES (${userId}::uuid, ${role})
      ON CONFLICT DO NOTHING
    `;
  }

  revalidatePath(`/mitglieder/${memberId}`);
  redirect(`/mitglieder/${memberId}?roles=1`);
}
