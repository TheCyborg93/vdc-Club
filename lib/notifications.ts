import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/access";
import type { CurrentUser } from "@/lib/auth";

export type ClubNotification = {
  key: string;
  title: string;
  detail: string;
  href: string;
  severity: "critical" | "warning" | "info";
  sortAt: string;
  read: boolean;
};

export async function getNotifications(
  user: CurrentUser,
  options: { limit?: number } = {},
): Promise<{ items: ClubNotification[]; unread: number }> {
  const sql=getDb();
  if (!sql) return { items:[],unread:0 };

  const rows: Array<Record<string,unknown>>=[];

  if (hasPermission(user.roles,"tasks.read") && user.memberId) {
    rows.push(...await sql`
      SELECT
        'task:' || id::text AS key,
        title,
        CASE
          WHEN due_date<CURRENT_DATE THEN 'Überfällig seit ' || to_char(due_date,'DD.MM.YYYY')
          WHEN due_date=CURRENT_DATE THEN 'Heute fällig'
          ELSE 'Fällig am ' || to_char(due_date,'DD.MM.YYYY')
        END AS detail,
        '/aufgaben' AS href,
        CASE
          WHEN due_date<CURRENT_DATE OR priority='urgent' THEN 'critical'
          WHEN priority='high' OR due_date<=CURRENT_DATE+interval '3 days' THEN 'warning'
          ELSE 'info'
        END AS severity,
        COALESCE(due_date::timestamp,created_at) AS sort_at
      FROM tasks
      WHERE owner_member_id=${user.memberId}::uuid
        AND deleted_at IS NULL
        AND status IN ('open','in_progress','blocked')
        AND (
          priority IN ('high','urgent')
          OR due_date IS NULL
          OR due_date<=CURRENT_DATE+interval '7 days'
        )
    `);
  }

  if (hasPermission(user.roles,"meetings.read")) {
    rows.push(...await sql`
      SELECT
        'meeting:' || m.id::text AS key,
        m.title,
        to_char(m.starts_at AT TIME ZONE 'Europe/Berlin','DD.MM.YYYY HH24:MI') ||
          COALESCE(' · ' || m.location,'') AS detail,
        '/sitzungen/' || m.id::text AS href,
        'info' AS severity,
        m.starts_at AS sort_at
      FROM meetings m
      WHERE m.status='planned'
        AND m.deleted_at IS NULL
        AND m.starts_at BETWEEN now() AND now()+interval '7 days'
        AND (
          ${user.memberId || null}::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM meeting_attendees ma
            WHERE ma.meeting_id=m.id
              AND ma.member_id=${user.memberId || null}::uuid
          )
          OR NOT EXISTS (
            SELECT 1 FROM meeting_attendees ma2
            WHERE ma2.meeting_id=m.id
          )
        )
    `);
  }

  if (hasPermission(user.roles,"documents.read")) {
    rows.push(...await sql`
      SELECT
        'document:' || id::text AS key,
        'Dokument prüfen: ' || title AS title,
        CASE
          WHEN valid_until IS NOT NULL AND valid_until<CURRENT_DATE
            THEN 'Gültigkeit abgelaufen am ' || to_char(valid_until,'DD.MM.YYYY')
          WHEN review_on IS NOT NULL AND review_on<=CURRENT_DATE
            THEN 'Prüftermin erreicht: ' || to_char(review_on,'DD.MM.YYYY')
          WHEN valid_until IS NOT NULL
            THEN 'Gültig bis ' || to_char(valid_until,'DD.MM.YYYY')
          ELSE 'Prüfen am ' || to_char(review_on,'DD.MM.YYYY')
        END AS detail,
        '/dokumente' AS href,
        CASE
          WHEN (valid_until IS NOT NULL AND valid_until<CURRENT_DATE)
            OR (review_on IS NOT NULL AND review_on<CURRENT_DATE)
          THEN 'critical'
          ELSE 'warning'
        END AS severity,
        COALESCE(review_on,valid_until,CURRENT_DATE)::timestamp AS sort_at
      FROM documents
      WHERE status IN ('active','review')
        AND deleted_at IS NULL
        AND (
          (review_on IS NOT NULL AND review_on<=CURRENT_DATE+interval '30 days')
          OR
          (valid_until IS NOT NULL AND valid_until<=CURRENT_DATE+interval '30 days')
        )
    `);
  }

  if (hasPermission(user.roles,"resolutions.read")) {
    rows.push(...await sql`
      SELECT
        'resolution:' || r.id::text AS key,
        'Beschluss offen: ' || COALESCE(r.resolution_number || ' · ','') || r.title AS title,
        CASE
          WHEN t.due_date<CURRENT_DATE THEN 'Folgeaufgabe überfällig'
          WHEN t.due_date IS NOT NULL THEN 'Frist ' || to_char(t.due_date,'DD.MM.YYYY')
          WHEN t.id IS NULL THEN 'Noch keine Folgeaufgabe hinterlegt'
          ELSE 'Umsetzung läuft'
        END AS detail,
        '/beschluesse' AS href,
        CASE
          WHEN t.due_date<CURRENT_DATE THEN 'critical'
          WHEN t.id IS NULL AND r.decided_at<now()-interval '14 days' THEN 'warning'
          ELSE 'info'
        END AS severity,
        COALESCE(t.due_date::timestamp,r.decided_at) AS sort_at
      FROM resolutions r
      LEFT JOIN tasks t
        ON t.source_type='resolution'
       AND t.source_id=r.id
       AND t.status<>'cancelled'
       AND t.deleted_at IS NULL
      WHERE r.status IN ('open','in_progress')
        AND (
          t.owner_member_id=${user.memberId || null}::uuid
          OR ${hasPermission(user.roles,"resolutions.write")}
        )
      LIMIT 20
    `);
  }

  if (hasPermission(user.roles,"sponsors.read")) {
    rows.push(...await sql`
      SELECT
        'sponsor:' || id::text AS key,
        'Sponsorvertrag: ' || name AS title,
        'Vertragsende ' || to_char(contract_end,'DD.MM.YYYY') AS detail,
        '/sponsoren' AS href,
        CASE WHEN contract_end<CURRENT_DATE THEN 'critical' ELSE 'warning' END AS severity,
        contract_end::timestamp AS sort_at
      FROM sponsors
      WHERE status='active'
        AND contract_end IS NOT NULL
        AND contract_end<=CURRENT_DATE+interval '60 days'
    `);
  }

  if (hasPermission(user.roles,"training.write")) {
    rows.push(...await sql`
      SELECT
        'training:' || id::text AS key,
        'Anwesenheit noch offen' AS title,
        to_char(scheduled_at AT TIME ZONE 'Europe/Berlin','DD.MM.YYYY HH24:MI') AS detail,
        '/training/' || id::text AS href,
        CASE WHEN scheduled_at<now()-interval '3 days' THEN 'warning' ELSE 'info' END AS severity,
        scheduled_at AS sort_at
      FROM training_sessions
      WHERE deleted_at IS NULL
        AND scheduled_at<now()
        AND status<>'cancelled'
        AND attendance_recorded_at IS NULL
      ORDER BY scheduled_at DESC
      LIMIT 8
    `);
  }

  if (user.roles.includes("admin")) {
    rows.push(...await sql`
      SELECT
        'integration:' || integration_key AS key,
        display_name || ': Integration gestört' AS title,
        COALESCE(last_error,'Status: ' || status) AS detail,
        '/admin/integrationen' AS href,
        'critical' AS severity,
        COALESCE(last_sync_at,updated_at) AS sort_at
      FROM integration_connections
      WHERE status='error'
    `);
  }

  const unique=new Map<string,Record<string,unknown>>();
  for (const row of rows) unique.set(String(row.key),row);

  const states=unique.size
    ? await sql`
        SELECT notification_key,read_at,dismissed_at
        FROM user_notification_state
        WHERE user_id=${user.id}::uuid
      `
    : [];

  const stateMap=new Map(states.map((row)=>[String(row.notification_key),row]));

  const items=[...unique.values()]
    .filter((row)=>!stateMap.get(String(row.key))?.dismissed_at)
    .map((row): ClubNotification=>({
      key:String(row.key),
      title:String(row.title),
      detail:String(row.detail ?? ""),
      href:String(row.href),
      severity:["critical","warning"].includes(String(row.severity))
        ? String(row.severity) as "critical" | "warning"
        : "info",
      sortAt:String(row.sort_at ?? new Date().toISOString()),
      read:Boolean(stateMap.get(String(row.key))?.read_at),
    }))
    .sort((a,b)=>{
      const rank=(value:string)=>value==="critical" ? 0 : value==="warning" ? 1 : 2;
      const diff=rank(a.severity)-rank(b.severity);
      if (diff) return diff;
      return new Date(a.sortAt).getTime()-new Date(b.sortAt).getTime();
    });

  const unread=items.filter((item)=>!item.read).length;
  return {
    items:items.slice(0,options.limit ?? 30),
    unread,
  };
}
