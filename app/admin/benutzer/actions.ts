"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { officialRoleKeys } from "@/lib/roles";

const allowedRoles = new Set<string>([
  ...officialRoleKeys,
  "tournament_director",
]);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function isLastActiveAdmin(userId: string) {
  const sql = getDb();
  if (!sql) return false;
  const rows = await sql`
    SELECT NOT EXISTS (
      SELECT 1
      FROM app_users u
      JOIN user_roles ur ON ur.user_id=u.id AND ur.role_key='admin'
      WHERE u.status='active'
        AND u.id <> ${userId}::uuid
    ) AS last_admin
  `;
  return Boolean(rows[0]?.last_admin);
}

export async function updateAdminUserStatusAction(formData: FormData) {
  const actor = await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/admin/benutzer?error=database");

  const userId = value(formData,"userId");
  const status = value(formData,"status");

  if (!userId || !["active","disabled"].includes(status)) {
    redirect("/admin/benutzer?error=invalid");
  }
  if (userId === actor.id && status !== "active") {
    redirect("/admin/benutzer?error=self_lockout");
  }

  const targetRows = await sql`
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id=${userId}::uuid AND role_key='admin'
    ) AS is_admin
  `;
  if (
    status === "disabled" &&
    Boolean(targetRows[0]?.is_admin) &&
    await isLastActiveAdmin(userId)
  ) {
    redirect("/admin/benutzer?error=last_admin");
  }

  await sql`
    UPDATE app_users
    SET status=${status},updated_at=now()
    WHERE id=${userId}::uuid
  `;

  if (status === "disabled") {
    await sql`DELETE FROM user_sessions WHERE user_id=${userId}::uuid`;
  }

  await writeAudit(actor.id,"user.status_changed","app_user",userId,{ status });

  revalidatePath("/admin");
  revalidatePath("/admin/benutzer");
  redirect("/admin/benutzer?updated=1");
}

export async function updateAdminUserRolesAction(formData: FormData) {
  const actor = await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/admin/benutzer?error=database");

  const userId = value(formData,"userId");
  const roles = new Set(
    formData.getAll("roles").map(String).filter((role)=>allowedRoles.has(role))
  );

  if (!userId) redirect("/admin/benutzer?error=invalid");

  const beforeRows = await sql`
    SELECT COALESCE(array_agg(role_key),ARRAY[]::text[]) AS roles
    FROM user_roles
    WHERE user_id=${userId}::uuid
  `;
  const before = Array.isArray(beforeRows[0]?.roles) ? beforeRows[0].roles.map(String) : [];
  const hadAdmin = before.includes("admin");

  if (hadAdmin && !roles.has("admin") && await isLastActiveAdmin(userId)) {
    redirect("/admin/benutzer?error=last_admin");
  }

  await sql`DELETE FROM user_roles WHERE user_id=${userId}::uuid`;
  for (const role of roles) {
    await sql`
      INSERT INTO user_roles (user_id,role_key)
      VALUES (${userId}::uuid,${role})
      ON CONFLICT DO NOTHING
    `;
  }

  await writeAudit(actor.id,"user.roles_changed","app_user",userId,{
    before,
    after:[...roles],
  });

  revalidatePath("/admin/benutzer");
  revalidatePath("/vorstand");
  revalidatePath("/mitglieder");
  redirect("/admin/benutzer?roles=1");
}

export async function unlockAdminUserAction(formData: FormData) {
  const actor = await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/admin/benutzer?error=database");

  const userId = value(formData,"userId");
  if (!userId) redirect("/admin/benutzer?error=invalid");

  await sql`
    UPDATE app_users
    SET failed_login_count=0,locked_until=NULL,updated_at=now()
    WHERE id=${userId}::uuid
  `;

  await writeAudit(actor.id,"user.unlocked","app_user",userId);

  revalidatePath("/admin/benutzer");
  redirect("/admin/benutzer?unlocked=1");
}

export async function revokeAdminUserSessionsAction(formData: FormData) {
  const actor = await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/admin/benutzer?error=database");

  const userId = value(formData,"userId");
  if (!userId || userId === actor.id) {
    redirect("/admin/benutzer?error=self_sessions");
  }

  const result = await sql`
    DELETE FROM user_sessions
    WHERE user_id=${userId}::uuid
    RETURNING id
  `;

  await writeAudit(actor.id,"user.sessions_revoked","app_user",userId,{
    sessions:result.length,
  });

  revalidatePath("/admin/benutzer");
  redirect("/admin/benutzer?sessions=1");
}
