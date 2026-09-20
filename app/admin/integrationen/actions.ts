"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { syncAllIntegrations, syncIntegration, type IntegrationKey } from "@/lib/club-sync";

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


export async function syncIntegrationAction(formData: FormData) {
  const actor=await requirePermission("settings.manage");
  const key=value(formData,"key") as IntegrationKey;
  if (!["vdc_tc","vdc_turnier","vdc_training"].includes(key)) {
    redirect("/admin/integrationen?error=integration");
  }

  const result=await syncIntegration(key);
  await writeAudit(actor.id,"integration.manual_sync","integration",key,{
    ok:result.ok,
    status:result.status,
    error:result.error ?? null,
  });

  revalidatePath("/");
  revalidatePath("/kalender");
  revalidatePath("/admin");
  revalidatePath("/admin/integrationen");
  revalidatePath("/admin/status");

  redirect(result.ok
    ? `/admin/integrationen?synced=${encodeURIComponent(key)}`
    : `/admin/integrationen?sync_error=${encodeURIComponent(key)}`
  );
}

export async function syncAllIntegrationsAction() {
  const actor=await requirePermission("settings.manage");
  const result=await syncAllIntegrations();

  await writeAudit(actor.id,"integration.manual_sync_all","integration",null,{
    ok:result.ok,
    results:result.results.map((item)=>({
      key:item.key,
      ok:item.ok,
      status:item.status,
      error:item.error ?? null,
    })),
  });

  revalidatePath("/");
  revalidatePath("/kalender");
  revalidatePath("/admin");
  revalidatePath("/admin/integrationen");
  revalidatePath("/admin/status");

  redirect(result.ok
    ? "/admin/integrationen?synced=all"
    : "/admin/integrationen?sync_error=all"
  );
}
