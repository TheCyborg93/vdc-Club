"use server";

import { scryptSync } from "node:crypto";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  createSession,
  deleteCurrentSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

function safeNext(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export async function loginAction(formData: FormData) {
  const sql = getDb();
  if (!sql) redirect("/login?error=database");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) redirect("/login?error=missing");

  const rows = await sql`
    SELECT id::text, password_hash, failed_login_count, locked_until
    FROM app_users
    WHERE lower(email) = ${email}
      AND status = 'active'
    LIMIT 1
  `;

  const row = rows[0];

  if (!row) {
    scryptSync(password, "vdc-dummy-login-salt", 64, { N: 16384, r: 8, p: 1 });
    redirect("/login?error=invalid");
  }

  if (row.locked_until && new Date(String(row.locked_until)).getTime() > Date.now()) {
    redirect("/login?error=locked");
  }

  const valid = row.password_hash
    ? verifyPassword(password, String(row.password_hash))
    : false;

  if (!valid) {
    await sql`
      UPDATE app_users
      SET
        failed_login_count = failed_login_count + 1,
        locked_until = CASE
          WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes'
          ELSE locked_until
        END
      WHERE id = ${String(row.id)}::uuid
    `;
    redirect("/login?error=invalid");
  }

  await sql`
    UPDATE app_users
    SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
    WHERE id = ${String(row.id)}::uuid
  `;

  await createSession(String(row.id));
  redirect(next);
}

export async function setupAdminAction(formData: FormData) {
  const sql = getDb();
  if (!sql) redirect("/setup?error=database");

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!firstName || !lastName || !email || !password) redirect("/setup?error=missing");
  if (password !== confirm) redirect("/setup?error=confirm");
  if (password.length < 12) redirect("/setup?error=password");

  const adminRows = await sql`
    SELECT EXISTS(SELECT 1 FROM user_roles WHERE role_key = 'admin') AS exists
  `;
  if (adminRows[0]?.exists) redirect("/login");

  const passwordHash = hashPassword(password);
  let rows;

  try {
    rows = await sql`
      WITH new_member AS (
        INSERT INTO members (first_name, last_name, email, status, join_date)
        VALUES (${firstName}, ${lastName}, ${email}, 'active', CURRENT_DATE)
        RETURNING id
      ),
      new_user AS (
        INSERT INTO app_users (member_id, email, display_name, password_hash, password_changed_at, status)
        SELECT id, ${email}, ${firstName + " " + lastName}, ${passwordHash}, now(), 'active'
        FROM new_member
        RETURNING id
      ),
      assigned_roles AS (
        INSERT INTO user_roles (user_id, role_key)
        SELECT new_user.id, role_key
        FROM new_user
        CROSS JOIN (VALUES ('admin'::text), ('board'::text)) AS r(role_key)
      )
      SELECT id::text FROM new_user
    `;
  } catch {
    redirect("/setup?error=exists");
  }

  const userId = rows[0]?.id;
  if (!userId) redirect("/setup?error=unknown");

  await createSession(String(userId));
  redirect("/");
}

export async function logoutAction() {
  await deleteCurrentSession();
  redirect("/login");
}
