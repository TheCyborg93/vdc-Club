import { getDb } from "@/lib/db";

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
};

export async function getDashboardData(): Promise<DashboardData> {
  const sql = getDb();
  if (!sql) return emptyData;

  try {
    const [members, teams, taskCount, eventCount, activity, tasks, events, integrations] = await Promise.all([
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
          count(*) FILTER (
            WHERE source='vdc_training'
              AND EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Europe/Berlin') = EXTRACT(YEAR FROM CURRENT_DATE)
          )::int AS training_days_year,
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
        SELECT integration_key,display_name,status,last_sync_at
        FROM integration_connections
        ORDER BY
          CASE integration_key
            WHEN 'vdc_tc' THEN 0
            WHEN 'vdc_turnier' THEN 1
            ELSE 2
          END
      `,
    ]);

    const activityRow = activity[0] ?? {};

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
    };
  } catch {
    return emptyData;
  }
}
