"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createTeamAction(formData: FormData) {
  await requirePermission("teams.write");
  const sql = getDb();
  if (!sql) redirect("/mannschaften?error=database");

  const name = value(formData, "name");
  const shortName = value(formData, "shortName");
  const league = value(formData, "league");
  const season = value(formData, "season");
  const venue = value(formData, "venue");
  const teamType = value(formData, "teamType");

  if (!name) redirect("/mannschaften?error=missing");

  const rows = await sql`
    INSERT INTO teams (
      name, short_name, league, season, venue, team_type, status
    )
    VALUES (
      ${name}, ${shortName || null}, ${league || null}, ${season || null},
      ${venue || null}, ${teamType || null}, 'active'
    )
    RETURNING id::text
  `;

  revalidatePath("/mannschaften");
  redirect(rows[0]?.id ? `/mannschaften/${rows[0].id}?created=1` : "/mannschaften");
}

export async function updateTeamAction(formData: FormData) {
  await requirePermission("teams.write");
  const sql = getDb();
  if (!sql) redirect("/mannschaften?error=database");

  const id = value(formData, "id");
  const name = value(formData, "name");
  const shortName = value(formData, "shortName");
  const league = value(formData, "league");
  const season = value(formData, "season");
  const venue = value(formData, "venue");
  const teamType = value(formData, "teamType");
  const status = value(formData, "status");

  if (!id || !name || !["active","archived"].includes(status)) {
    redirect(`/mannschaften/${id}?error=invalid`);
  }

  await sql`
    UPDATE teams
    SET
      name = ${name},
      short_name = ${shortName || null},
      league = ${league || null},
      season = ${season || null},
      venue = ${venue || null},
      team_type = ${teamType || null},
      status = ${status}
    WHERE id = ${id}::uuid
  `;

  revalidatePath("/mannschaften");
  revalidatePath(`/mannschaften/${id}`);
  redirect(`/mannschaften/${id}?saved=1`);
}

export async function addTeamMemberAction(formData: FormData) {
  await requirePermission("teams.write");
  const sql = getDb();
  if (!sql) redirect("/mannschaften?error=database");

  const teamId = value(formData, "teamId");
  const memberId = value(formData, "memberId");
  if (!teamId || !memberId) redirect(`/mannschaften/${teamId}?error=member`);

  await sql`
    INSERT INTO team_members (team_id, member_id, is_captain, is_active)
    VALUES (${teamId}::uuid, ${memberId}::uuid, false, true)
    ON CONFLICT (team_id, member_id)
    DO UPDATE SET is_active = true
  `;

  revalidatePath("/mannschaften");
  revalidatePath(`/mannschaften/${teamId}`);
  redirect(`/mannschaften/${teamId}?member=1`);
}

export async function setTeamCaptainAction(formData: FormData) {
  await requirePermission("teams.write");
  const sql = getDb();
  if (!sql) redirect("/mannschaften?error=database");

  const teamId = value(formData, "teamId");
  const memberId = value(formData, "memberId");
  const isCaptain = value(formData, "isCaptain") === "true";

  if (!teamId || !memberId) redirect(`/mannschaften/${teamId}?error=member`);

  await sql`
    UPDATE team_members
    SET is_captain = ${isCaptain}
    WHERE team_id = ${teamId}::uuid
      AND member_id = ${memberId}::uuid
      AND is_active = true
  `;

  if (isCaptain) {
    await sql`
      INSERT INTO user_roles (user_id, role_key)
      SELECT id, 'team_captain'
      FROM app_users
      WHERE member_id = ${memberId}::uuid
      ON CONFLICT DO NOTHING
    `;
  } else {
    await sql`
      DELETE FROM user_roles ur
      USING app_users u
      WHERE ur.user_id = u.id
        AND ur.role_key = 'team_captain'
        AND u.member_id = ${memberId}::uuid
        AND NOT EXISTS (
          SELECT 1
          FROM team_members tm
          WHERE tm.member_id = ${memberId}::uuid
            AND tm.is_active = true
            AND tm.is_captain = true
        )
    `;
  }

  revalidatePath("/mannschaften");
  revalidatePath(`/mannschaften/${teamId}`);
  redirect(`/mannschaften/${teamId}?captain=1`);
}

export async function removeTeamMemberAction(formData: FormData) {
  await requirePermission("teams.write");
  const sql = getDb();
  if (!sql) redirect("/mannschaften?error=database");

  const teamId = value(formData, "teamId");
  const memberId = value(formData, "memberId");
  if (!teamId || !memberId) redirect(`/mannschaften/${teamId}?error=member`);

  await sql`
    UPDATE team_members
    SET is_active = false, is_captain = false
    WHERE team_id = ${teamId}::uuid
      AND member_id = ${memberId}::uuid
  `;

  await sql`
    DELETE FROM user_roles ur
    USING app_users u
    WHERE ur.user_id = u.id
      AND ur.role_key = 'team_captain'
      AND u.member_id = ${memberId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.member_id = ${memberId}::uuid
          AND tm.is_active = true
          AND tm.is_captain = true
      )
  `;

  revalidatePath("/mannschaften");
  revalidatePath(`/mannschaften/${teamId}`);
  redirect(`/mannschaften/${teamId}?removed=1`);
}
