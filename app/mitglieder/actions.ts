"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

const allowedRoles = new Set([
  "admin", "board", "chair", "vice_chair", "treasurer",
  "secretary", "sport_director", "team_captain", "tournament_director",
]);

const allowedStatuses = new Set(["active","passive","inactive"]);
const allowedMembershipTypes = new Set(["regular","youth","honorary","other"]);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createMemberAction(formData: FormData) {
  const actor = await requirePermission("members.write");
  const sql = getDb();
  if (!sql) redirect("/mitglieder?error=database");

  const firstName = value(formData, "firstName");
  const lastName = value(formData, "lastName");
  const email = value(formData, "email").toLowerCase();
  const memberNumber = value(formData, "memberNumber");
  const joinDate = value(formData, "joinDate");
  const status = value(formData, "status") || "active";
  const membershipType = value(formData, "membershipType") || "regular";

  if (!firstName || !lastName || !allowedStatuses.has(status) || !allowedMembershipTypes.has(membershipType)) {
    redirect("/mitglieder?error=missing");
  }

  try {
    const rows = await sql`
      INSERT INTO members (
        first_name, last_name, email, member_number, join_date, status, membership_type
      )
      VALUES (
        ${firstName},
        ${lastName},
        ${email || null},
        ${memberNumber || null},
        ${joinDate || null}::date,
        ${status},
        ${membershipType}
      )
      RETURNING id::text
    `;

    const memberId = rows[0]?.id ? String(rows[0].id) : "";
    if (memberId) {
      await sql`
        INSERT INTO member_status_history (
          member_id, old_status, new_status, reason, effective_date, changed_by
        )
        VALUES (
          ${memberId}::uuid,
          NULL,
          ${status},
          'Mitglied angelegt',
          COALESCE(${joinDate || null}::date,CURRENT_DATE),
          ${actor.id}::uuid
        )
      `;
    }
  } catch {
    redirect("/mitglieder?error=duplicate");
  }

  revalidatePath("/mitglieder");
  revalidatePath("/verein");
  revalidatePath("/");
  redirect("/mitglieder?created=1");
}

export async function updateMemberAction(formData: FormData) {
  const actor = await requirePermission("members.write");
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
  const noticeDate = value(formData, "noticeDate");
  const leaveDate = value(formData, "leaveDate");
  const status = value(formData, "status") || "active";
  const membershipType = value(formData, "membershipType") || "regular";
  const statusReason = value(formData, "statusReason");
  const notes = value(formData, "notes");

  if (
    !id ||
    !firstName ||
    !lastName ||
    !allowedStatuses.has(status) ||
    !allowedMembershipTypes.has(membershipType)
  ) {
    redirect(`/mitglieder/${id}?error=missing`);
  }

  const beforeRows = await sql`
    SELECT status
    FROM members
    WHERE id=${id}::uuid
    LIMIT 1
  `;
  const oldStatus = beforeRows[0]?.status ? String(beforeRows[0].status) : null;

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
      notice_date = ${noticeDate || null}::date,
      leave_date = ${leaveDate || null}::date,
      status = ${status},
      membership_type = ${membershipType},
      status_reason = ${statusReason || null},
      status_changed_at = CASE
        WHEN status IS DISTINCT FROM ${status} THEN now()
        ELSE status_changed_at
      END,
      notes = ${notes || null}
    WHERE id = ${id}::uuid
  `;

  if (oldStatus && oldStatus !== status) {
    await sql`
      INSERT INTO member_status_history (
        member_id, old_status, new_status, reason, effective_date, changed_by
      )
      VALUES (
        ${id}::uuid,
        ${oldStatus},
        ${status},
        ${statusReason || null},
        COALESCE(${leaveDate || null}::date,CURRENT_DATE),
        ${actor.id}::uuid
      )
    `;
  }

  revalidatePath("/mitglieder");
  revalidatePath(`/mitglieder/${id}`);
  revalidatePath("/verein");
  revalidatePath("/finanzen");
  revalidatePath("/");
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

  await writeAudit(
    (await requirePermission("settings.manage")).id,
    "member.account_created",
    "app_user",
    userId,
    { memberId, roles: selectedRoles },
  );

  revalidatePath(`/mitglieder/${memberId}`);
  revalidatePath("/admin/benutzer");
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

  const beforeRows = await sql`
    SELECT COALESCE(array_agg(role_key),ARRAY[]::text[]) AS roles
    FROM user_roles
    WHERE user_id=${userId}::uuid
  `;
  const before = Array.isArray(beforeRows[0]?.roles) ? beforeRows[0].roles.map(String) : [];
  const roles = new Set(selectedRoles);

  if (userId === actor.id) roles.add("admin");

  if (before.includes("admin") && !roles.has("admin")) {
    const otherAdmins = await sql`
      SELECT count(DISTINCT u.id)::int AS count
      FROM app_users u
      JOIN user_roles ur ON ur.user_id=u.id
      WHERE ur.role_key='admin'
        AND u.status='active'
        AND u.id<>${userId}::uuid
    `;
    if (Number(otherAdmins[0]?.count ?? 0) === 0) {
      redirect(`/mitglieder/${memberId}?error=last_admin`);
    }
  }

  await sql`DELETE FROM user_roles WHERE user_id = ${userId}::uuid`;

  for (const role of roles) {
    await sql`
      INSERT INTO user_roles (user_id, role_key)
      VALUES (${userId}::uuid, ${role})
      ON CONFLICT DO NOTHING
    `;
  }

  await writeAudit(actor.id,"member.roles_changed","app_user",userId,{
    memberId,
    before,
    after:[...roles],
  });

  revalidatePath(`/mitglieder/${memberId}`);
  revalidatePath("/admin/benutzer");
  redirect(`/mitglieder/${memberId}?roles=1`);
}


export async function deleteUnusedMemberAction(formData: FormData) {
  const actor=await requirePermission("settings.manage");
  const sql=getDb();
  if (!sql) redirect("/mitglieder?error=database");

  const id=value(formData,"id");
  if (!id) redirect("/mitglieder?error=missing");

  const rows=await sql`
    SELECT
      m.id::text,m.first_name,m.last_name,
      EXISTS(SELECT 1 FROM app_users u WHERE u.member_id=m.id) AS has_user,
      EXISTS(SELECT 1 FROM board_positions b WHERE b.member_id=m.id) AS has_board,
      EXISTS(SELECT 1 FROM documents d WHERE d.member_id=m.id) AS has_documents,
      EXISTS(SELECT 1 FROM finance_entries f WHERE f.member_id=m.id) AS has_finance,
      EXISTS(SELECT 1 FROM meeting_attendees ma WHERE ma.member_id=m.id) AS has_meetings,
      EXISTS(SELECT 1 FROM membership_fees mf WHERE mf.member_id=m.id) AS has_fees,
      EXISTS(SELECT 1 FROM tasks t WHERE t.owner_member_id=m.id) AS has_tasks,
      EXISTS(SELECT 1 FROM team_members tm WHERE tm.member_id=m.id) AS has_teams,
      EXISTS(SELECT 1 FROM training_attendance ta WHERE ta.member_id=m.id) AS has_training,
      EXISTS(SELECT 1 FROM integration_entity_links l WHERE l.local_id=m.id) AS has_integration
    FROM members m
    WHERE m.id=${id}::uuid
    LIMIT 1
  `;
  const member=rows[0];

  if (
    !member ||
    member.has_user ||
    member.has_board ||
    member.has_documents ||
    member.has_finance ||
    member.has_meetings ||
    member.has_fees ||
    member.has_tasks ||
    member.has_teams ||
    member.has_training ||
    member.has_integration
  ) {
    redirect(`/mitglieder/${id}?error=member_delete`);
  }

  await sql`DELETE FROM members WHERE id=${id}::uuid`;
  await writeAudit(actor.id,"member.deleted_unused","member",id,{
    name:String(member.first_name)+" "+String(member.last_name),
  });

  revalidatePath("/mitglieder");
  revalidatePath("/verein");
  revalidatePath("/");
  redirect("/mitglieder?deleted=1");
}
