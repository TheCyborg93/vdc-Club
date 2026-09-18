import { getDb } from "@/lib/db";
import { ensureTrainingSchedule } from "@/lib/training";

export type DashboardTask = {
  title: string;
  category: string;
  dueDate: string | null;
  priority: string;
};

export type DashboardEvent = {
  title: string;
  startsAt: string;
  location: string | null;
  eventType: string;
  source: string;
  team: string | null;
};

export type DashboardIntegration = {
  key: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
};

export type DashboardAlert = {
  kind: string;
  title: string;
  detail: string;
  href: string;
  severity: "critical" | "warning" | "info";
};

export type DashboardTraining = {
  nextAt: string | null;
  pendingAttendance: number;
  personalRecorded: number;
  personalAttended: number;
  personalRate: number;
};

export type DashboardData = {
  members: number;
  teams: number;
  openTasks: number;
  upcomingEvents: number;
  tournamentsYear: number;
  trainingDaysYear: number;
  leagueEvents: number;
  connectedIntegrations: number;
  tasks: DashboardTask[];
  events: DashboardEvent[];
  integrations: DashboardIntegration[];
  alerts: DashboardAlert[];
  training: DashboardTraining | null;
};

const emptyData: DashboardData = {
  members: 0,
  teams: 0,
  openTasks: 0,
  upcomingEvents: 0,
  tournamentsYear: 0,
  trainingDaysYear: 0,
  leagueEvents: 0,
  connectedIntegrations: 0,
  tasks: [],
  events: [],
  integrations: [],
  alerts: [],
  training: null,
};

function severityRank(value: string) {
  if (value === "critical") return 0;
  if (value === "warning") return 1;
  return 2;
}

export async function getDashboardData(
  options: { includeSystem?: boolean; includeTraining?: boolean; memberId?: string | null } = {},
): Promise<DashboardData> {
  const sql = getDb();
  if (!sql) return emptyData;
  await ensureTrainingSchedule(365);

  try {
    const [
      members,
      teams,
      taskCount,
      eventCount,
      activity,
      tasks,
      events,
      businessAlerts,
    ] = await Promise.all([
      sql`SELECT count(*)::int AS count FROM members WHERE status = 'active'`,
      sql`SELECT count(*)::int AS count FROM teams WHERE status = 'active'`,
      sql`SELECT count(*)::int AS count FROM tasks WHERE status IN ('open','in_progress','blocked')`,
      sql`SELECT count(*)::int AS count FROM club_events WHERE starts_at >= now() AND starts_at < now() + interval '14 days'`,
      sql`
        SELECT
          count(*) FILTER (
            WHERE source='vdc_turnier'
              AND EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Europe/Berlin') = EXTRACT(YEAR FROM CURRENT_DATE)
          )::int AS tournaments_year,
          (
            SELECT count(*)::int
            FROM training_sessions
            WHERE status<>'cancelled'
              AND EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'Europe/Berlin') = EXTRACT(YEAR FROM CURRENT_DATE)
          ) AS training_days_year,
          count(*) FILTER (WHERE source='vdc_tc' AND event_type='league')::int AS league_events
        FROM club_events
      `,
      sql`
        SELECT title, COALESCE(category, 'Allgemein') AS category, due_date, priority
        FROM tasks
        WHERE status IN ('open','in_progress','blocked')
        ORDER BY
          CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          due_date NULLS LAST
        LIMIT 4
      `,
      sql`
        SELECT
          e.title,
          e.starts_at,
          e.location,
          e.event_type,
          e.source,
          t.short_name AS team
        FROM club_events e
        LEFT JOIN teams t ON t.id=e.team_id
        WHERE e.starts_at >= now()
        ORDER BY e.starts_at ASC
        LIMIT 5
      `,
      sql`
        SELECT kind,title,detail,href,severity,sort_date
        FROM (
          SELECT
            'fee'::text AS kind,
            m.first_name || ' ' || m.last_name || ': Beitrag überfällig' AS title,
            'Fällig seit ' || to_char(mf.due_date,'DD.MM.YYYY') || ' · ' ||
              to_char(mf.amount,'FM999999990D00') || ' €' AS detail,
            '/mitglieder/' || m.id::text AS href,
            'critical'::text AS severity,
            mf.due_date::timestamp AS sort_date
          FROM membership_fees mf
          JOIN members m ON m.id=mf.member_id
          WHERE mf.status='open'
            AND mf.due_date IS NOT NULL
            AND mf.due_date < CURRENT_DATE

          UNION ALL

          SELECT
            'task',
            'Aufgabe überfällig: ' || t.title,
            'Fällig seit ' || to_char(t.due_date,'DD.MM.YYYY'),
            '/aufgaben',
            CASE WHEN t.priority IN ('urgent','high') THEN 'critical' ELSE 'warning' END,
            t.due_date::timestamp
          FROM tasks t
          WHERE t.status IN ('open','in_progress','blocked')
            AND t.due_date IS NOT NULL
            AND t.due_date < CURRENT_DATE

          UNION ALL

          SELECT
            'member_leave',
            m.first_name || ' ' || m.last_name || ': Austritt vorgemerkt',
            'Austritt zum ' || to_char(m.leave_date,'DD.MM.YYYY'),
            '/mitglieder/' || m.id::text,
            'warning',
            m.leave_date::timestamp
          FROM members m
          WHERE m.leave_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '90 days'

          UNION ALL

          SELECT
            'member_notice',
            m.first_name || ' ' || m.last_name || ': Kündigung ohne Austrittsdatum',
            'Kündigung eingegangen am ' || to_char(m.notice_date,'DD.MM.YYYY'),
            '/mitglieder/' || m.id::text,
            'warning',
            m.notice_date::timestamp
          FROM members m
          WHERE m.notice_date IS NOT NULL
            AND m.leave_date IS NULL
            AND m.status <> 'inactive'

          UNION ALL

          SELECT
            'sponsor',
            'Sponsorvertrag läuft aus: ' || s.name,
            'Vertragsende ' || to_char(s.contract_end,'DD.MM.YYYY'),
            '/sponsoren',
            CASE WHEN s.contract_end < CURRENT_DATE THEN 'critical' ELSE 'warning' END,
            s.contract_end::timestamp
          FROM sponsors s
          WHERE s.status='active'
            AND s.contract_end IS NOT NULL
            AND s.contract_end <= CURRENT_DATE + interval '60 days'

          UNION ALL

          SELECT
            'document',
            'Dokument prüfen: ' || d.title,
            'Gültig bis ' || to_char(d.valid_until,'DD.MM.YYYY'),
            '/dokumente',
            CASE WHEN d.valid_until < CURRENT_DATE THEN 'critical' ELSE 'warning' END,
            d.valid_until::timestamp
          FROM documents d
          WHERE d.status='active'
            AND d.valid_until IS NOT NULL
            AND d.valid_until <= CURRENT_DATE + interval '30 days'
        ) warnings
        ORDER BY
          CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          sort_date NULLS LAST
        LIMIT 8
      `,
    ]);

    const integrations = options.includeSystem
      ? await sql`
          SELECT integration_key,display_name,status,last_sync_at
          FROM integration_connections
          ORDER BY
            CASE integration_key
              WHEN 'vdc_tc' THEN 0
              WHEN 'vdc_turnier' THEN 1
              ELSE 2
            END
        `
      : [];

    const systemAlerts = options.includeSystem
      ? await sql`
          SELECT
            'integration'::text AS kind,
            display_name || ': Integration gestört' AS title,
            COALESCE(last_error,'Status: ' || status) AS detail,
            '/admin/integrationen'::text AS href,
            'critical'::text AS severity,
            COALESCE(last_sync_at,updated_at) AS sort_date
          FROM integration_connections
          WHERE status='error'
        `
      : [];

    const trainingRows = options.includeTraining
      ? await sql`
          SELECT
            (
              SELECT scheduled_at
              FROM training_sessions
              WHERE scheduled_at>=now()
                AND status<>'cancelled'
              ORDER BY scheduled_at
              LIMIT 1
            ) AS next_training,
            (
              SELECT count(*)::int
              FROM training_sessions
              WHERE scheduled_at<now()
                AND status<>'cancelled'
                AND attendance_recorded_at IS NULL
            ) AS pending_attendance,
            (
              SELECT count(s.id)::int
              FROM training_attendance a
              JOIN training_sessions s ON s.id=a.session_id
              WHERE a.member_id=${options.memberId || null}::uuid
                AND s.attendance_recorded_at IS NOT NULL
                AND s.status='completed'
                AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')
                    = EXTRACT(YEAR FROM CURRENT_DATE)
            ) AS personal_recorded,
            (
              SELECT count(s.id)::int
              FROM training_attendance a
              JOIN training_sessions s ON s.id=a.session_id
              WHERE a.member_id=${options.memberId || null}::uuid
                AND a.attendance='present'
                AND s.attendance_recorded_at IS NOT NULL
                AND s.status='completed'
                AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')
                    = EXTRACT(YEAR FROM CURRENT_DATE)
            ) AS personal_attended
        `
      : [];

    const mergedAlerts = [...businessAlerts, ...systemAlerts]
      .sort((a, b) => {
        const severityDiff = severityRank(String(a.severity)) - severityRank(String(b.severity));
        if (severityDiff !== 0) return severityDiff;
        return new Date(String(a.sort_date ?? 0)).getTime() - new Date(String(b.sort_date ?? 0)).getTime();
      })
      .slice(0, 8);

    const activityRow = activity[0] ?? {};
    const trainingRow = trainingRows[0] ?? null;
    const personalRecorded = Number(trainingRow?.personal_recorded ?? 0);
    const personalAttended = Number(trainingRow?.personal_attended ?? 0);

    return {
      members: Number(members[0]?.count ?? 0),
      teams: Number(teams[0]?.count ?? 0),
      openTasks: Number(taskCount[0]?.count ?? 0),
      upcomingEvents: Number(eventCount[0]?.count ?? 0),
      tournamentsYear: Number(activityRow.tournaments_year ?? 0),
      trainingDaysYear: Number(activityRow.training_days_year ?? 0),
      leagueEvents: Number(activityRow.league_events ?? 0),
      connectedIntegrations: integrations.filter((row) => row.status === "connected").length,
      tasks: tasks.map((row) => ({
        title: String(row.title),
        category: String(row.category),
        dueDate: row.due_date ? String(row.due_date) : null,
        priority: String(row.priority),
      })),
      events: events.map((row) => ({
        title: String(row.title),
        startsAt: String(row.starts_at),
        location: row.location ? String(row.location) : null,
        eventType: String(row.event_type),
        source: String(row.source),
        team: row.team ? String(row.team) : null,
      })),
      integrations: integrations.map((row) => ({
        key: String(row.integration_key),
        name: String(row.display_name),
        status: String(row.status),
        lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
      })),
      alerts: mergedAlerts.map((row) => ({
        kind: String(row.kind),
        title: String(row.title),
        detail: String(row.detail),
        href: String(row.href),
        severity: ["critical","warning","info"].includes(String(row.severity))
          ? String(row.severity) as DashboardAlert["severity"]
          : "info",
      })),
      training: trainingRow ? {
        nextAt: trainingRow.next_training ? String(trainingRow.next_training) : null,
        pendingAttendance: Number(trainingRow.pending_attendance ?? 0),
        personalRecorded,
        personalAttended,
        personalRate: personalRecorded
          ? Math.round((personalAttended / personalRecorded) * 100)
          : 0,
      } : null,
    };
  } catch {
    return emptyData;
  }
}
