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
};

export type DashboardData = {
  members: number;
  teams: number;
  openTasks: number;
  upcomingEvents: number;
  tasks: DashboardTask[];
  events: DashboardEvent[];
};

const emptyData: DashboardData = {
  members: 0,
  teams: 0,
  openTasks: 0,
  upcomingEvents: 0,
  tasks: [],
  events: [],
};

export async function getDashboardData(): Promise<DashboardData> {
  const sql = getDb();
  if (!sql) return emptyData;

  try {
    const [members, teams, taskCount, eventCount, tasks, events] = await Promise.all([
      sql`SELECT count(*)::int AS count FROM members WHERE status = 'active'`,
      sql`SELECT count(*)::int AS count FROM teams WHERE status = 'active'`,
      sql`SELECT count(*)::int AS count FROM tasks WHERE status IN ('open','in_progress','blocked')`,
      sql`SELECT count(*)::int AS count FROM club_events WHERE starts_at >= now() AND starts_at < now() + interval '14 days'`,
      sql`SELECT title, COALESCE(category, 'Allgemein') AS category, due_date, priority
          FROM tasks
          WHERE status IN ('open','in_progress','blocked')
          ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                   due_date NULLS LAST
          LIMIT 3`,
      sql`SELECT title, starts_at, location
          FROM club_events
          WHERE starts_at >= now()
          ORDER BY starts_at ASC
          LIMIT 3`,
    ]);

    return {
      members: Number(members[0]?.count ?? 0),
      teams: Number(teams[0]?.count ?? 0),
      openTasks: Number(taskCount[0]?.count ?? 0),
      upcomingEvents: Number(eventCount[0]?.count ?? 0),
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
      })),
    };
  } catch {
    return emptyData;
  }
}
