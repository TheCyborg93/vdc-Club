import { getDb } from "@/lib/db";
import { ensureTrainingSchedule } from "@/lib/training";

export type DashboardTask = {
  id: string;
  title: string;
  category: string;
  dueDate: string | null;
  priority: string;
  status: string;
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

export type DashboardResolution = {
  id: string;
  number: string | null;
  title: string;
  status: string;
  decidedAt: string;
};

export type DashboardDocumentReview = {
  id: string;
  title: string;
  category: string;
  status: string;
  reviewOn: string | null;
  validUntil: string | null;
};

export type DashboardCelebration = {
  id: string;
  kind: "birthday" | "anniversary";
  name: string;
  detail: string;
  years: number | null;
};

export type DashboardRoleMetric = {
  label: string;
  value: string;
  note: string;
  href: string;
  tone: "neutral" | "warning" | "critical" | "success";
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
  celebrations: DashboardCelebration[];
  training: DashboardTraining | null;
  roleMetrics: DashboardRoleMetric[];
  resolutions: DashboardResolution[];
  reviewDocuments: DashboardDocumentReview[];
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
  celebrations: [],
  training: null,
  roleMetrics: [],
  resolutions: [],
  reviewDocuments: [],
};

function severityRank(value: string) {
  if (value === "critical") return 0;
  if (value === "warning") return 1;
  return 2;
}

export async function getDashboardData(
  options: {
    includeSystem?: boolean;
    includeTraining?: boolean;
    memberId?: string | null;
    primaryRole?: string;
  } = {},
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
      celebrations,
      businessAlerts,
    ] = await Promise.all([
      sql`SELECT count(*)::int AS count FROM members WHERE status = 'active'`,
      sql`SELECT count(*)::int AS count FROM teams WHERE status = 'active' AND deleted_at IS NULL`,
      sql`SELECT count(*)::int AS count FROM tasks WHERE deleted_at IS NULL AND status IN ('open','in_progress','blocked')`,
      sql`SELECT count(*)::int AS count FROM club_events WHERE deleted_at IS NULL AND starts_at >= now() AND starts_at < now() + interval '14 days'`,
      sql`
        SELECT
          count(*) FILTER (
            WHERE source='vdc_turnier'
              AND EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Europe/Berlin') = EXTRACT(YEAR FROM CURRENT_DATE)
          )::int AS tournaments_year,
          (
            SELECT count(*)::int
            FROM training_sessions
            WHERE deleted_at IS NULL
              AND status<>'cancelled'
              AND EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'Europe/Berlin') = EXTRACT(YEAR FROM CURRENT_DATE)
          ) AS training_days_year,
          count(*) FILTER (WHERE source='vdc_tc' AND event_type='league')::int AS league_events
        FROM club_events
        WHERE deleted_at IS NULL
      `,
      sql`
        SELECT id::text,title,COALESCE(category, 'Allgemein') AS category,due_date,priority,status
        FROM tasks
        WHERE deleted_at IS NULL
          AND status IN ('open','in_progress','blocked')
        ORDER BY
          CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          due_date NULLS LAST
        LIMIT 5
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
        LEFT JOIN teams t ON t.id=e.team_id AND t.deleted_at IS NULL
        WHERE e.deleted_at IS NULL
          AND e.starts_at >= now()
        ORDER BY e.starts_at ASC
        LIMIT 5
      `,
      sql`
        SELECT
          m.id::text,
          'birthday'::text AS kind,
          m.first_name || ' ' || m.last_name ||
            CASE WHEN m.nickname IS NOT NULL AND trim(m.nickname)<>'' THEN ' „' || m.nickname || '“' ELSE '' END AS name,
          'hat heute Geburtstag'::text AS detail,
          NULL::int AS years
        FROM members m
        WHERE m.status IN ('active','passive')
          AND m.birth_date IS NOT NULL
          AND EXTRACT(MONTH FROM m.birth_date)=EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(DAY FROM m.birth_date)=EXTRACT(DAY FROM CURRENT_DATE)

        UNION ALL

        SELECT
          m.id::text,
          'anniversary'::text AS kind,
          m.first_name || ' ' || m.last_name ||
            CASE WHEN m.nickname IS NOT NULL AND trim(m.nickname)<>'' THEN ' „' || m.nickname || '“' ELSE '' END AS name,
          EXTRACT(YEAR FROM AGE(CURRENT_DATE,m.join_date))::int || ' Jahre im Verein' AS detail,
          EXTRACT(YEAR FROM AGE(CURRENT_DATE,m.join_date))::int AS years
        FROM members m
        WHERE m.status IN ('active','passive')
          AND m.join_date IS NOT NULL
          AND EXTRACT(YEAR FROM AGE(CURRENT_DATE,m.join_date))::int > 0
          AND EXTRACT(MONTH FROM m.join_date)=EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(DAY FROM m.join_date)=EXTRACT(DAY FROM CURRENT_DATE)

        ORDER BY kind,name
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
          WHERE t.deleted_at IS NULL
            AND t.status IN ('open','in_progress','blocked')
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
          WHERE s.deleted_at IS NULL
            AND s.status='active'
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
          WHERE d.deleted_at IS NULL
            AND d.status='active'
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
              WHERE deleted_at IS NULL
                AND scheduled_at>=now()
                AND status<>'cancelled'
              ORDER BY scheduled_at
              LIMIT 1
            ) AS next_training,
            (
              SELECT count(*)::int
              FROM training_sessions
              WHERE deleted_at IS NULL
                AND scheduled_at<now()
                AND status<>'cancelled'
                AND attendance_recorded_at IS NULL
            ) AS pending_attendance,
            (
              SELECT count(s.id)::int
              FROM training_attendance a
              JOIN training_sessions s ON s.id=a.session_id
              WHERE a.member_id=${options.memberId || null}::uuid
                AND s.deleted_at IS NULL
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
                AND s.deleted_at IS NULL
                AND s.attendance_recorded_at IS NOT NULL
                AND s.status='completed'
                AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')
                    = EXTRACT(YEAR FROM CURRENT_DATE)
            ) AS personal_attended
        `
      : [];

    let roleMetricRows: Array<Record<string,unknown>>=[];

    if (options.primaryRole==="admin") {
      roleMetricRows=await sql`
        SELECT 'Datenqualität' AS label,
          (
            (SELECT count(*) FROM members
              WHERE status='active'
                AND (email IS NULL OR trim(email)='' OR member_number IS NULL OR trim(member_number)='' OR join_date IS NULL))
            +
            (SELECT count(*) FROM teams t
              WHERE t.status='active' AND t.deleted_at IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM team_members tm
                  WHERE tm.team_id=t.id AND tm.is_active=true AND tm.is_captain=true
                ))
            +
            (SELECT count(*) FROM integration_connections WHERE status='error')
          )::text AS value,
          'Auffälligkeiten prüfen' AS note,
          '/admin/daten' AS href,
          CASE WHEN (
            (SELECT count(*) FROM integration_connections WHERE status='error')
          )>0 THEN 'critical' ELSE 'warning' END AS tone
        UNION ALL
        SELECT 'Integrationen',
          count(*) FILTER (WHERE status='error')::text,
          'mit Fehlerstatus',
          '/admin/integrationen',
          CASE WHEN count(*) FILTER (WHERE status='error')>0 THEN 'critical' ELSE 'success' END
        FROM integration_connections
        UNION ALL
        SELECT 'Benutzer',
          count(*) FILTER (WHERE status='active')::text,
          'aktive Zugänge',
          '/admin/benutzer',
          'neutral'
        FROM app_users
      `;
    } else if (["chair","vice_chair","board"].includes(options.primaryRole ?? "")) {
      roleMetricRows=await sql`
        SELECT 'Offene Beschlüsse' AS label,
          count(*) FILTER (WHERE status IN ('open','in_progress'))::text AS value,
          'noch nicht abgeschlossen' AS note,
          '/beschluesse' AS href,
          CASE WHEN count(*) FILTER (WHERE status='open')>0 THEN 'warning' ELSE 'neutral' END AS tone
        FROM resolutions
        UNION ALL
        SELECT 'Überfällige Aufgaben',
          count(*)::text,
          'Frist überschritten',
          '/aufgaben',
          CASE WHEN count(*)>0 THEN 'critical' ELSE 'success' END
        FROM tasks
        WHERE deleted_at IS NULL
          AND status IN ('open','in_progress','blocked')
          AND due_date<CURRENT_DATE
        UNION ALL
        SELECT 'Nächste Sitzung',
          COALESCE(to_char(min(starts_at) AT TIME ZONE 'Europe/Berlin','DD.MM.'),'–'),
          'geplanter Vorstandstermin',
          '/sitzungen',
          'neutral'
        FROM meetings
        WHERE deleted_at IS NULL
          AND status='planned'
          AND starts_at>=now()
      `;
    } else if (options.primaryRole==="secretary") {
      roleMetricRows=await sql`
        SELECT 'Nächste Sitzung' AS label,
          COALESCE(to_char(min(starts_at) AT TIME ZONE 'Europe/Berlin','DD.MM.'),'–') AS value,
          'Vorbereitung & Protokoll' AS note,
          '/sitzungen' AS href,
          'neutral' AS tone
        FROM meetings
        WHERE deleted_at IS NULL
          AND status='planned'
          AND starts_at>=now()
        UNION ALL
        SELECT 'Protokolle offen',
          count(*)::text,
          'Entwürfe fertigstellen',
          '/sitzungen',
          CASE WHEN count(*)>0 THEN 'warning' ELSE 'success' END
        FROM meetings
        WHERE deleted_at IS NULL
          AND status='completed'
          AND minutes_status='draft'
        UNION ALL
        SELECT 'In Prüfung',
          count(*)::text,
          'wartet auf Freigabe',
          '/sitzungen',
          CASE WHEN count(*)>0 THEN 'warning' ELSE 'success' END
        FROM meetings
        WHERE deleted_at IS NULL
          AND minutes_status='review'
        UNION ALL
        SELECT 'Offene Beschlüsse',
          count(*)::text,
          'Beschlussbuch pflegen',
          '/beschluesse',
          CASE WHEN count(*)>0 THEN 'warning' ELSE 'success' END
        FROM resolutions
        WHERE status IN ('open','in_progress')
      `;
    } else if (options.primaryRole==="treasurer") {
      roleMetricRows=await sql`
        SELECT 'Offene Beiträge' AS label,
          COALESCE(to_char(sum(amount) FILTER (WHERE status='open'),'FM999999990D00'),'0,00') || ' €' AS value,
          count(*) FILTER (WHERE status='open')::text || ' Forderungen' AS note,
          '/finanzen' AS href,
          CASE WHEN count(*) FILTER (WHERE status='open')>0 THEN 'warning' ELSE 'success' END AS tone
        FROM membership_fees
        WHERE fiscal_year=EXTRACT(YEAR FROM CURRENT_DATE)::int
        UNION ALL
        SELECT 'Überfällig',
          count(*)::text,
          'Beiträge nach Fälligkeit',
          '/finanzen',
          CASE WHEN count(*)>0 THEN 'critical' ELSE 'success' END
        FROM membership_fees
        WHERE status='open'
          AND due_date IS NOT NULL
          AND due_date<CURRENT_DATE
        UNION ALL
        SELECT 'Jahressaldo',
          COALESCE(
            to_char(
              sum(CASE WHEN entry_type='income' THEN amount ELSE -amount END)
                FILTER (WHERE status='booked'),
              'FM999999990D00'
            ),
            '0,00'
          ) || ' €',
          'gebuchte Einnahmen/Ausgaben',
          '/finanzen',
          'neutral'
        FROM finance_entries
        WHERE EXTRACT(YEAR FROM booked_on)=EXTRACT(YEAR FROM CURRENT_DATE)
      `;
    } else if (options.primaryRole==="sport_director") {
      roleMetricRows=await sql`
        SELECT 'Mannschaften' AS label,
          count(*)::text AS value,
          'aktive Teams' AS note,
          '/mannschaften' AS href,
          'neutral' AS tone
        FROM teams
        WHERE status='active' AND deleted_at IS NULL
        UNION ALL
        SELECT 'Ligatermine',
          count(*)::text,
          'nächste 30 Tage',
          '/kalender',
          'neutral'
        FROM club_events
        WHERE deleted_at IS NULL
          AND event_type='league'
          AND starts_at BETWEEN now() AND now()+interval '30 days'
        UNION ALL
        SELECT 'Training offen',
          count(*)::text,
          'Anwesenheiten nachtragen',
          '/training',
          CASE WHEN count(*)>0 THEN 'warning' ELSE 'success' END
        FROM training_sessions
        WHERE deleted_at IS NULL
          AND scheduled_at<now()
          AND status<>'cancelled'
          AND attendance_recorded_at IS NULL
      `;
    } else if (options.primaryRole==="team_captain") {
      roleMetricRows=await sql`
        WITH own_teams AS (
          SELECT DISTINCT t.id
          FROM teams t
          JOIN team_members tm ON tm.team_id=t.id
          WHERE t.deleted_at IS NULL
            AND t.status='active'
            AND tm.member_id=${options.memberId || null}::uuid
            AND tm.is_active=true
            AND tm.is_captain=true
        )
        SELECT 'Deine Teams' AS label,
          count(*)::text AS value,
          'als Captain' AS note,
          '/mannschaften' AS href,
          'neutral' AS tone
        FROM own_teams
        UNION ALL
        SELECT 'Kader',
          count(DISTINCT tm.member_id)::text,
          'aktive Spieler in deinen Teams',
          '/mannschaften',
          'neutral'
        FROM team_members tm
        JOIN own_teams ot ON ot.id=tm.team_id
        WHERE tm.is_active=true
        UNION ALL
        SELECT 'Teamtermine',
          count(*)::text,
          'nächste 30 Tage',
          '/kalender',
          'neutral'
        FROM club_events e
        JOIN own_teams ot ON ot.id=e.team_id
        WHERE e.deleted_at IS NULL
          AND e.starts_at BETWEEN now() AND now()+interval '30 days'
      `;
    } else if (options.primaryRole==="tournament_director") {
      roleMetricRows=await sql`
        SELECT 'Turniere' AS label,
          count(*)::text AS value,
          'nächste 30 Tage' AS note,
          '/kalender' AS href,
          'neutral' AS tone
        FROM club_events
        WHERE deleted_at IS NULL
          AND event_type='tournament'
          AND starts_at BETWEEN now() AND now()+interval '30 days'
        UNION ALL
        SELECT 'Turnieraufgaben',
          count(*)::text,
          'offen oder in Arbeit',
          '/aufgaben',
          CASE WHEN count(*)>0 THEN 'warning' ELSE 'success' END
        FROM tasks
        WHERE deleted_at IS NULL
          AND status IN ('open','in_progress','blocked')
          AND (
            COALESCE(category,'') ILIKE '%turnier%'
            OR title ILIKE '%turnier%'
          )
        UNION ALL
        SELECT 'Dieses Jahr',
          count(*)::text,
          'interne Turniere',
          '/statistik',
          'neutral'
        FROM club_events
        WHERE deleted_at IS NULL
          AND event_type='tournament'
          AND EXTRACT(YEAR FROM starts_at AT TIME ZONE 'Europe/Berlin')=EXTRACT(YEAR FROM CURRENT_DATE)
      `;
    } else {
      roleMetricRows=await sql`
        SELECT 'Termine' AS label,
          count(*)::text AS value,
          'nächste 14 Tage' AS note,
          '/kalender' AS href,
          'neutral' AS tone
        FROM club_events
        WHERE deleted_at IS NULL
          AND starts_at BETWEEN now() AND now()+interval '14 days'
      `;
    }

    const resolutionRows=await sql`
      SELECT id::text,resolution_number,title,status,decision_outcome,decided_at
      FROM resolutions
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'implemented' THEN 2 ELSE 3 END,
        decided_at DESC
      LIMIT 3
    `;

    const reviewDocumentRows=await sql`
      SELECT id::text,title,category,status,review_on,valid_until
      FROM documents
      WHERE deleted_at IS NULL
        AND (
          status='review'
          OR (review_on IS NOT NULL AND review_on<=CURRENT_DATE+interval '30 days')
          OR (valid_until IS NOT NULL AND valid_until<=CURRENT_DATE+interval '30 days')
        )
      ORDER BY
        CASE WHEN status='review' THEN 0 ELSE 1 END,
        COALESCE(review_on,valid_until,CURRENT_DATE)
      LIMIT 3
    `;

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
        id: String(row.id),
        title: String(row.title),
        category: String(row.category),
        dueDate: row.due_date ? String(row.due_date) : null,
        priority: String(row.priority),
        status: String(row.status),
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
      celebrations: celebrations.map((row)=>({
        id:String(row.id),
        kind:String(row.kind)==="anniversary" ? "anniversary" : "birthday",
        name:String(row.name),
        detail:String(row.detail),
        years:row.years==null ? null : Number(row.years),
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
      roleMetrics: roleMetricRows.map((row)=>({
        label:String(row.label),
        value:String(row.value ?? "–"),
        note:String(row.note ?? ""),
        href:String(row.href ?? "/"),
        tone:["warning","critical","success"].includes(String(row.tone))
          ? String(row.tone) as DashboardRoleMetric["tone"]
          : "neutral",
      })),
      resolutions:resolutionRows.map((row)=>({
        id:String(row.id),
        number:row.resolution_number ? String(row.resolution_number) : null,
        title:String(row.title),
        status:row.decision_outcome==="rejected" ? "rejected" : String(row.status),
        decidedAt:String(row.decided_at),
      })),
      reviewDocuments:reviewDocumentRows.map((row)=>({
        id:String(row.id),
        title:String(row.title),
        category:String(row.category),
        status:String(row.status),
        reviewOn:row.review_on ? String(row.review_on) : null,
        validUntil:row.valid_until ? String(row.valid_until) : null,
      })),
    };
  } catch {
    return emptyData;
  }
}
