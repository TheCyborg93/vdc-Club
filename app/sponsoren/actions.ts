"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createSponsorAction(formData: FormData) {
  await requirePermission("sponsors.write");
  const sql = getDb();
  if (!sql) redirect("/sponsoren?error=database");

  const name = value(formData, "name");
  const contactName = value(formData, "contactName");
  const email = value(formData, "email");
  const phone = value(formData, "phone");
  const contractStart = value(formData, "contractStart");
  const contractEnd = value(formData, "contractEnd");
  const contributionText = value(formData, "contributionText");
  const clubBenefits = value(formData, "clubBenefits");
  const status = value(formData, "status") || "active";

  if (!name || !["lead","active","expired","inactive"].includes(status)) {
    redirect("/sponsoren?error=invalid");
  }

  await sql`
    INSERT INTO sponsors (
      name, contact_name, email, phone, contract_start, contract_end,
      contribution_text, club_benefits, status
    )
    VALUES (
      ${name},
      ${contactName || null},
      ${email || null},
      ${phone || null},
      ${contractStart || null}::date,
      ${contractEnd || null}::date,
      ${contributionText || null},
      ${clubBenefits || null},
      ${status}
    )
  `;

  revalidatePath("/sponsoren");
  redirect("/sponsoren?created=1");
}

export async function updateSponsorStatusAction(formData: FormData) {
  await requirePermission("sponsors.write");
  const sql = getDb();
  if (!sql) redirect("/sponsoren?error=database");

  const id = value(formData, "id");
  const status = value(formData, "status");
  if (!id || !["lead","active","expired","inactive"].includes(status)) {
    redirect("/sponsoren?error=invalid");
  }

  await sql`
    UPDATE sponsors
    SET status = ${status}
    WHERE id = ${id}::uuid
  `;

  revalidatePath("/sponsoren");
  redirect("/sponsoren");
}
