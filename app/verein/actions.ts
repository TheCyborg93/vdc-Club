"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberOrNull(input: string) {
  if (!input) return null;
  const parsed = Number(input.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateClubProfileAction(formData: FormData) {
  await requirePermission("members.write");
  const sql = getDb();
  if (!sql) redirect("/verein?error=database");

  const clubName = value(formData, "clubName");
  const shortName = value(formData, "shortName");
  const legalForm = value(formData, "legalForm");
  const street = value(formData, "street");
  const postalCode = value(formData, "postalCode");
  const city = value(formData, "city");
  const email = value(formData, "email").toLowerCase();
  const phone = value(formData, "phone");
  const website = value(formData, "website");
  const foundedOn = value(formData, "foundedOn");
  const fiscalYearStartMonth = Number(value(formData, "fiscalYearStartMonth") || "1");
  const defaultAnnualFee = numberOrNull(value(formData, "defaultAnnualFee"));
  const feeDueMonth = numberOrNull(value(formData, "feeDueMonth"));
  const feeDueDay = numberOrNull(value(formData, "feeDueDay"));
  const notes = value(formData, "notes");

  if (!clubName || !shortName || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    redirect("/verein?error=invalid");
  }

  if (
    (feeDueMonth !== null && (feeDueMonth < 1 || feeDueMonth > 12)) ||
    (feeDueDay !== null && (feeDueDay < 1 || feeDueDay > 31))
  ) {
    redirect("/verein?error=invalid");
  }

  await sql\`
    INSERT INTO club_profile (
      id, club_name, short_name, legal_form, street, postal_code, city,
      email, phone, website, founded_on, fiscal_year_start_month,
      default_annual_fee, fee_due_month, fee_due_day, notes
    )
    VALUES (
      1, \${clubName}, \${shortName}, \${legalForm || null}, \${street || null},
      \${postalCode || null}, \${city || null}, \${email || null}, \${phone || null},
      \${website || null}, \${foundedOn || null}::date, \${fiscalYearStartMonth},
      \${defaultAnnualFee}, \${feeDueMonth}, \${feeDueDay}, \${notes || null}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      club_name=EXCLUDED.club_name,
      short_name=EXCLUDED.short_name,
      legal_form=EXCLUDED.legal_form,
      street=EXCLUDED.street,
      postal_code=EXCLUDED.postal_code,
      city=EXCLUDED.city,
      email=EXCLUDED.email,
      phone=EXCLUDED.phone,
      website=EXCLUDED.website,
      founded_on=EXCLUDED.founded_on,
      fiscal_year_start_month=EXCLUDED.fiscal_year_start_month,
      default_annual_fee=EXCLUDED.default_annual_fee,
      fee_due_month=EXCLUDED.fee_due_month,
      fee_due_day=EXCLUDED.fee_due_day,
      notes=EXCLUDED.notes
  \`;

  revalidatePath("/verein");
  revalidatePath("/finanzen");
  revalidatePath("/");
  redirect("/verein?saved=1");
}
