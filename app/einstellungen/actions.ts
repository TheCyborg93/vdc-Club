"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function setIntegrationEnabledAction(formData: FormData) {
  await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/einstellungen?error=database");

  const key = value(formData, "key");
  const enabled = value(formData, "enabled") === "true";
  if (!["vdc_tc","vdc_turnier","vdc_training"].includes(key)) {
    redirect("/einstellungen?error=integration");
  }

  if (enabled) {
    await sql`
      UPDATE integration_connections
      SET
        status = CASE WHEN last_sync_at IS NOT NULL THEN 'connected' ELSE 'disconnected' END,
        updated_at = now()
      WHERE integration_key = ${key}
    `;
  } else {
    await sql`
      UPDATE integration_connections
      SET status = 'disabled', updated_at = now()
      WHERE integration_key = ${key}
    `;
  }

  revalidatePath("/einstellungen");
  redirect("/einstellungen?updated=1");
}
