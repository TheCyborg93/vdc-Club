"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function setIntegrationEnabledAction(formData: FormData) {
  const actor = await requirePermission("settings.manage");
  const sql = getDb();
  if (!sql) redirect("/admin/integrationen?error=database");

  const key = value(formData, "key");
  const enabled = value(formData, "enabled") === "true";

  if (!["vdc_tc","vdc_turnier","vdc_training"].includes(key)) {
    redirect("/admin/integrationen?error=integration");
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

  await writeAudit(
    actor.id,
    enabled ? "integration.enabled" : "integration.disabled",
    "integration",
    key,
    { enabled },
  );

  revalidatePath("/admin");
  revalidatePath("/admin/integrationen");
  revalidatePath("/admin/status");
  redirect("/admin/integrationen?updated=1");
}
