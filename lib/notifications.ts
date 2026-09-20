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

  if (hasPermission(user.roles,"members.read")) {
    rows.push(...await sql`
      WITH upcoming_days AS (
        SELECT day::date
        FROM generate_series(
          CURRENT_DATE,
          CURRENT_DATE + interval '7 days',
          interval '1 day'
        ) AS day
      )
      SELECT
        'birthday:' || m.id::text || ':' || to_char(d.day,'YYYY') AS key,
        'Geburtstag: ' ||
          m.first_name || ' ' || m.last_name ||
          CASE
            WHEN m.nickname IS NOT NULL AND trim(m.nickname)<>''
              THEN ' „' || m.nickname || '“'
            ELSE ''
          END AS title,
        CASE
          WHEN d.day=CURRENT_DATE THEN 'Hat heute Geburtstag'
          ELSE 'Geburtstag am ' || to_char(d.day,'DD.MM.YYYY')
        END AS detail,
        '/mitglieder/' || m.id::text AS href,
        'info' AS severity,
        d.day::timestamp AS sort_at
      FROM members m
      JOIN upcoming_days d
        ON EXTRACT(MONTH FROM m.birth_date)=EXTRACT(MONTH FROM d.day)
       AND EXTRACT(DAY FROM m.birth_date)=EXTRACT(DAY FROM d.day)
      WHERE m.status IN ('active','passive')
        AND m.birth_date IS NOT NULL

      UNION ALL

      SELECT
        'anniversary:' || m.id::text || ':' || to_char(d.day,'YYYY') AS key,
        'Vereinsjubiläum: ' ||
          m.first_name || ' ' || m.last_name ||
          CASE
            WHEN m.nickname IS NOT NULL AND trim(m.nickname)<>''
              THEN ' „' || m.nickname || '“'
            ELSE ''
          END AS title,
        (
          EXTRACT(YEAR FROM d.day)::int - EXTRACT(YEAR FROM m.join_date)::int
        )::text || ' Jahre Mitglied' ||
        CASE
          WHEN d.day=CURRENT_DATE THEN ' · Heute'
          ELSE ' · am ' || to_char(d.day,'DD.MM.YYYY')
        END AS detail,
        '/mitglieder/' || m.id::text AS href,
        'info' AS severity,
        d.day::timestamp AS sort_at
      FROM members m
      JOIN upcoming_days d
        ON EXTRACT(MONTH FROM m.join_date)=EXTRACT(MONTH FROM d.day)
       AND EXTRACT(DAY FROM m.join_date)=EXTRACT(DAY FROM d.day)
      WHERE m.status IN ('active','passive')
        AND m.join_date IS NOT NULL
        AND EXTRACT(YEAR FROM d.day)::int - EXTRACT(YEAR FROM m.join_date)::int > 0
    `);
  }

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

  if (hasPermission(user.roles,"meetings.write")) {
    rows.push(...await sql`
      SELECT
        'meeting-running:' || m.id::text || ':' || x.open_agenda::text || ':' || x.invited::text AS key,
        'Sitzung abschließen: ' || m.title AS title,
        CASE
          WHEN x.open_agenda>0 AND x.invited>0
            THEN x.open_agenda::text || ' offene TOPs · ' || x.invited::text || ' Anwesenheiten ungeklärt'
          WHEN x.open_agenda>0
            THEN x.open_agenda::text || ' offene oder aktive TOPs'
          WHEN x.invited>0
            THEN x.invited::text || ' Anwesenheiten ungeklärt'
          ELSE 'Sitzung kann beendet werden'
        END AS detail,
        '/sitzungen/' || m.id::text AS href,
        CASE
          WHEN m.starts_at<now()-interval '6 hours' THEN 'warning'
          ELSE 'info'
        END AS severity,
        m.starts_at AS sort_at
      FROM meetings m
      CROSS JOIN LATERAL (
        SELECT
          (
            SELECT count(*)::int
            FROM agenda_items ai
            WHERE ai.meeting_id=m.id
              AND ai.status IN ('open','active')
          ) AS open_agenda,
          (
            SELECT count(*)::int
            FROM meeting_attendees ma
            WHERE ma.meeting_id=m.id
              AND ma.attendance='invited'
          ) AS invited
      ) x
      WHERE m.status='running'
        AND m.deleted_at IS NULL
    `);
  }

  if (hasPermission(user.roles,"documents.read")) {
    rows.push(...await sql`
      SELECT
        'document:' || id::text || ':' || status || ':' ||
          COALESCE(review_on::text,valid_until::text,'review') AS key,
        CASE
          WHEN category='Protokoll' AND status='review'
            THEN 'Protokoll prüfen: ' || title
          ELSE 'Dokument prüfen: ' || title
        END AS title,
        CASE
          WHEN status='review'
            THEN 'Zur Prüfung markiert'
          WHEN valid_until IS NOT NULL AND valid_until<CURRENT_DATE
            THEN 'Gültigkeit abgelaufen am ' || to_char(valid_until,'DD.MM.YYYY')
          WHEN review_on IS NOT NULL AND review_on<=CURRENT_DATE
            THEN 'Prüftermin erreicht: ' || to_char(review_on,'DD.MM.YYYY')
          WHEN valid_until IS NOT NULL
            THEN 'Gültig bis ' || to_char(valid_until,'DD.MM.YYYY')
          ELSE 'Prüfung erforderlich'
        END AS detail,
        '/dokumente/' || id::text AS href,
        CASE
          WHEN (valid_until IS NOT NULL AND valid_until<CURRENT_DATE)
            OR (review_on IS NOT NULL AND review_on<CURRENT_DATE)
          THEN 'critical'
          ELSE 'warning'
        END AS severity,
        COALESCE(review_on::timestamp,valid_until::timestamp,updated_at) AS sort_at
      FROM documents
      WHERE status IN ('active','review')
        AND deleted_at IS NULL
        AND (
          status='review'
          OR (review_on IS NOT NULL AND review_on<=CURRENT_DATE+interval '30 days')
          OR (valid_until IS NOT NULL AND valid_until<=CURRENT_DATE+interval '30 days')
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
        CASE
          WHEN r.resolution_number IS NOT NULL
            THEN '/beschluesse?q=' || r.resolution_number
          ELSE '/beschluesse'
        END AS href,
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
      WHERE deleted_at IS NULL
        AND status='active'
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
