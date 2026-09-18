"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

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


export async function deleteUnusedSponsorAction(formData: FormData) {
  const actor=await requirePermission("settings.manage");
  const sql=getDb();
  if (!sql) redirect("/sponsoren?error=database");

  const id=value(formData,"id");
  if (!id) redirect("/sponsoren?error=invalid");

  const rows=await sql`
    SELECT
      s.id::text,s.name,s.status,
      EXISTS(SELECT 1 FROM documents d WHERE d.sponsor_id=s.id) AS has_documents
    FROM sponsors s
    WHERE s.id=${id}::uuid
    LIMIT 1
  `;
  const sponsor=rows[0];

  if (
    !sponsor ||
    !["lead","inactive"].includes(String(sponsor.status)) ||
    sponsor.has_documents
  ) {
    redirect("/sponsoren?error=sponsor_delete");
  }

  await sql`DELETE FROM sponsors WHERE id=${id}::uuid`;
  await writeAudit(actor.id,"sponsor.deleted_unused","sponsor",id,{name:String(sponsor.name)});

  revalidatePath("/sponsoren");
  revalidatePath("/archiv");
  revalidatePath("/");
  redirect("/sponsoren?deleted=1");
}
