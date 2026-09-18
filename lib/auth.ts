import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth-constants";

const SESSION_DAYS = 30;

export type CurrentUser = {
  id: string;
  memberId: string | null;
  email: string;
  displayName: string;
  roles: string[];
};

function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const n = 16384;
  const r = 8;
  const p = 1;
  const derived = scryptSync(password, salt, 64, { N: n, r, p });
  return `scrypt$${n}$${r}$${p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string) {
  try {
    const [scheme, nRaw, rRaw, pRaw, saltRaw, hashRaw] = stored.split("$");
    if (scheme !== "scrypt" || !saltRaw || !hashRaw) return false;
    const expected = Buffer.from(hashRaw, "base64");
    const actual = scryptSync(password, Buffer.from(saltRaw, "base64"), expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function createSession(userId: string) {
  const sql = getDb();
  if (!sql) throw new Error("DATABASE_URL fehlt.");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = sessionHash(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO user_sessions (user_id, token_hash, expires_at)
    VALUES (${userId}::uuid, ${tokenHash}, ${expiresAt.toISOString()}::timestamptz)
  `;

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const sql = getDb();

  if (token && sql) {
    await sql`DELETE FROM user_sessions WHERE token_hash = ${sessionHash(token)}`;
  }

  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const sql = getDb();
  if (!sql) return null;

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await sql`
    SELECT
      u.id::text,
      u.member_id::text AS member_id,
      u.email,
      u.display_name,
      COALESCE(
        array_agg(ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL),
        ARRAY[]::text[]
      ) AS roles
    FROM user_sessions s
    JOIN app_users u ON u.id = s.user_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE s.token_hash = ${sessionHash(token)}
      AND s.expires_at > now()
      AND u.status = 'active'
    GROUP BY u.id, u.member_id, u.email, u.display_name
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    memberId: row.member_id ? String(row.member_id) : null,
    email: String(row.email),
    displayName: String(row.display_name),
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function hasAdminAccount() {
  const sql = getDb();
  if (!sql) return false;
  const rows = await sql`
    SELECT EXISTS(
      SELECT 1
      FROM user_roles
      WHERE role_key = 'admin'
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}
