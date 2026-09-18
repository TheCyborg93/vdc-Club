"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

function value(formData: FormData,key: string) {
  return String(formData.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/hinweise");
}

export async function markNotificationReadAction(formData: FormData) {
  const user=await requireUser();
  const sql=getDb();
  if (!sql) redirect("/hinweise");

  const key=value(formData,"key");
  if (!key) redirect("/hinweise");

  await sql`
    INSERT INTO user_notification_state (user_id,notification_key,read_at)
    VALUES (${user.id}::uuid,${key},now())
    ON CONFLICT (user_id,notification_key)
    DO UPDATE SET read_at=now(),dismissed_at=NULL
  `;

  refresh();
  redirect("/hinweise");
}

export async function dismissNotificationAction(formData: FormData) {
  const user=await requireUser();
  const sql=getDb();
  if (!sql) redirect("/hinweise");

  const key=value(formData,"key");
  if (!key) redirect("/hinweise");

  await sql`
    INSERT INTO user_notification_state (
      user_id,notification_key,read_at,dismissed_at
    )
    VALUES (${user.id}::uuid,${key},now(),now())
    ON CONFLICT (user_id,notification_key)
    DO UPDATE SET read_at=now(),dismissed_at=now()
  `;

  refresh();
  redirect("/hinweise");
}
