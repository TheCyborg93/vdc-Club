import { getDb } from "@/lib/db";

export async function writeAudit(
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata: Record<string, unknown> = {},
) {
  const sql = getDb();
  if (!sql) return;

  await sql`
    INSERT INTO audit_log (
      actor_user_id, action, entity_type, entity_id, metadata
    )
    VALUES (
      ${actorUserId || null}::uuid,
      ${action},
      ${entityType},
      ${entityId || null},
      ${JSON.stringify(metadata)}::jsonb
    )
  `;
}
