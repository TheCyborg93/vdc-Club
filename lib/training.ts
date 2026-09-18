import { getDb } from "@/lib/db";

export async function ensureTrainingSchedule(days = 365) {
  const sql = getDb();
  if (!sql) return;

  await sql`
    SELECT ensure_training_schedule(
      (CURRENT_DATE + (${days}::int * interval '1 day'))::date
    )
  `;
}
