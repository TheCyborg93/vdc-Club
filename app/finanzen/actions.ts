"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createFinanceEntryAction(formData: FormData) {
  await requirePermission("finance.write");
  const sql = getDb();
  if (!sql) redirect("/finanzen?error=database");

  const type = value(formData, "entryType");
  const amount = Number(value(formData, "amount").replace(",", "."));
  const category = value(formData, "category");
  const description = value(formData, "description");
  const bookedOn = value(formData, "bookedOn");
  const memberId = value(formData, "memberId");

  if (!["income","expense"].includes(type) || !Number.isFinite(amount) || amount < 0 || !category || !description || !bookedOn) {
    redirect("/finanzen?error=invalid");
  }

  await sql`
    INSERT INTO finance_entries (
      entry_type, amount, category, description, booked_on, status, member_id
    )
    VALUES (
      ${type}, ${amount}, ${category}, ${description}, ${bookedOn}::date, 'booked',
      ${memberId || null}::uuid
    )
  `;

  revalidatePath("/finanzen");
  revalidatePath("/");
  redirect("/finanzen?created=1");
}

export async function upsertBudgetAction(formData: FormData) {
  await requirePermission("finance.write");
  const sql = getDb();
  if (!sql) redirect("/finanzen?error=database");

  const year = Number(value(formData, "year"));
  const category = value(formData, "category");
  const amount = Number(value(formData, "amount").replace(",", "."));
  const notes = value(formData, "notes");

  if (!Number.isInteger(year) || !category || !Number.isFinite(amount) || amount < 0) {
    redirect("/finanzen?error=invalid");
  }

  await sql`
    INSERT INTO finance_budgets (fiscal_year, category, amount, notes)
    VALUES (${year}, ${category}, ${amount}, ${notes || null})
    ON CONFLICT (fiscal_year, category)
    DO UPDATE SET amount = EXCLUDED.amount, notes = EXCLUDED.notes
  `;

  revalidatePath("/finanzen");
  redirect("/finanzen?budget=1");
}

export async function generateMembershipFeesAction(formData: FormData) {
  await requirePermission("finance.write");
  const sql = getDb();
  if (!sql) redirect("/finanzen?error=database");

  const year = Number(value(formData, "year"));
  const amount = Number(value(formData, "amount").replace(",", "."));
  const dueDate = value(formData, "dueDate");

  if (!Number.isInteger(year) || !Number.isFinite(amount) || amount < 0) {
    redirect("/finanzen?error=invalid");
  }

  await sql`
    INSERT INTO membership_fees (member_id, fiscal_year, amount, due_date, status)
    SELECT id, ${year}, ${amount}, ${dueDate || null}::date, 'open'
    FROM members
    WHERE status = 'active'
    ON CONFLICT (member_id, fiscal_year) DO NOTHING
  `;

  revalidatePath("/finanzen");
  redirect("/finanzen?fees=1");
}

export async function updateMembershipFeeStatusAction(formData: FormData) {
  await requirePermission("finance.write");
  const sql = getDb();
  if (!sql) redirect("/finanzen?error=database");

  const id = value(formData, "id");
  const status = value(formData, "status");
  if (!id || !["open","paid","exempt","cancelled"].includes(status)) redirect("/finanzen?error=invalid");

  await sql`
    UPDATE membership_fees
    SET
      status = ${status},
      paid_on = CASE WHEN ${status} = 'paid' THEN COALESCE(paid_on, CURRENT_DATE) ELSE NULL END
    WHERE id = ${id}::uuid
  `;

  revalidatePath("/finanzen");
  redirect("/finanzen");
}
