import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  officialRoleDefinitions,
  roleLabel,
  rolePriority,
  sortedOfficialRoles,
} from "@/lib/roles";

export const dynamic = "force-dynamic";

type BoardUserRow = {
  id: string;
  memberId: string | null;
  userStatus: string;
  displayName: string;
  firstName: string;
  lastName: string;
  memberStatus: string;
  roles: string[];
};

type BoardHistoryRow = {
  id: string;
  title: string;
  startDate: unknown;
  endDate: unknown;
  firstName: string;
  lastName: string;
};

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE").format(date);
}

export default async function BoardPage() {
  const actor = await requirePermission("members.read");
  const sql = getDb();

  let userRows: BoardUserRow[] = [];
  let history: BoardHistoryRow[] = [];
  let workOverview={meetings:0,resolutions:0,tasks:0,documents:0};

  if (sql) {
    const [rawUsers, rawHistory, rawWork] = await Promise.all([
      sql`
        SELECT
          u.id::text,
          u.member_id::text,
          u.status AS user_status,
          u.display_name,
          m.first_name,
          m.last_name,
          m.status AS member_status,
          COALESCE(
            array_agg(ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL),
            ARRAY[]::text[]
          ) AS roles
        FROM app_users u
        JOIN members m ON m.id = u.member_id
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        WHERE m.status <> 'inactive'
        GROUP BY u.id,m.id
        ORDER BY m.last_name,m.first_name
      `,
      sql`
        SELECT
          bp.id::text,
          bp.title,
          bp.start_date,
          bp.end_date,
          m.first_name,
          m.last_name
        FROM board_positions bp
        JOIN members m ON m.id = bp.member_id
        WHERE bp.is_active = false
        ORDER BY bp.end_date DESC NULLS LAST
        LIMIT 8
      `,
      sql`
        SELECT
          (
            SELECT count(*)::int
            FROM meetings
            WHERE deleted_at IS NULL
              AND status IN ('planned','running')
          ) AS meetings,
          (
            SELECT count(*)::int
            FROM resolutions
            WHERE status IN ('open','in_progress')
              AND COALESCE(decision_outcome,'accepted')<>'rejected'
          ) AS resolutions,
          (
            SELECT count(*)::int
            FROM tasks
            WHERE deleted_at IS NULL
              AND status IN ('open','in_progress','blocked')
          ) AS tasks,
          (
            SELECT count(*)::int
            FROM documents
            WHERE deleted_at IS NULL
              AND status='review'
          ) AS documents
      `,
    ]);

    userRows = rawUsers.map((row) => ({
      id: String(row.id),
      memberId: row.member_id ? String(row.member_id) : null,
      userStatus: String(row.user_status),
      displayName: String(row.display_name),
      firstName: String(row.first_name),
      lastName: String(row.last_name),
      memberStatus: String(row.member_status),
      roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
    }));

    history = rawHistory.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      startDate: row.start_date,
      endDate: row.end_date,
      firstName: String(row.first_name),
      lastName: String(row.last_name),
    }));

    workOverview={
      meetings:Number(rawWork[0]?.meetings ?? 0),
      resolutions:Number(rawWork[0]?.resolutions ?? 0),
      tasks:Number(rawWork[0]?.tasks ?? 0),
      documents:Number(rawWork[0]?.documents ?? 0),
    };
  }

  const people = userRows
    .map((row) => {
      const roles = sortedOfficialRoles(row.roles);
      return {
        ...row,
        roles,
        primaryRole: roles[0] ?? null,
        additionalRoles: roles.slice(1),
      };
    })
    .filter((person) => person.primaryRole)
    .sort((a, b) => {
      const roleDifference = rolePriority(String(a.primaryRole)) - rolePriority(String(b.primaryRole));
      if (roleDifference !== 0) return roleDifference;
      return `${String(a.lastName)} ${String(a.firstName)}`.localeCompare(
        `${String(b.lastName)} ${String(b.firstName)}`,
        "de",
      );
    });

  const canManage = hasPermission(actor.roles, "settings.manage");
  const canMeetings = hasPermission(actor.roles, "meetings.read");
  const canResolutions = hasPermission(actor.roles, "resolutions.read");
  const canTasks = hasPermission(actor.roles, "tasks.read");
  const canDocuments = hasPermission(actor.roles, "documents.read");
  const multipleRoles = people.filter((person) => person.additionalRoles.length > 0).length;
  const activeAccounts = people.filter((person) => person.userStatus === "active").length;

  return (
    <div className="page-stack">
      <section className="page-heading board-heading">
        <div>
          <span className="eyebrow">Verein</span>
          <h1>Vorstand</h1>
          <p>
            Aktuelle Besetzung und laufende Vorstandsarbeit an einem Ort. Rollen und Zugänge werden automatisch aus der Vereinsverwaltung übernommen.
          </p>
        </div>
        {canManage && (
          <Link href="/admin/benutzer" className="primary-button">
            Rollen verwalten
          </Link>
        )}
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span>Personen mit Funktion</span>
          <strong>{people.length}</strong>
          <small>automatisch aus Rollen</small>
        </article>
        <article className="stat-card">
          <span>Mehrfachrollen</span>
          <strong>{multipleRoles}</strong>
          <small>mit Zusatzvermerk</small>
        </article>
        <article className="stat-card">
          <span>Aktive Zugänge</span>
          <strong>{activeAccounts}</strong>
          <small>VDC Club Login aktiv</small>
        </article>
        <article className="stat-card">
          <span>Rollenarten</span>
          <strong>{officialRoleDefinitions.length}</strong>
          <small>offizielle Struktur</small>
        </article>
      </section>

      <section className="board-work-hub">
        <div className="board-work-head">
          <div>
            <span className="eyebrow">Vorstandsarbeit</span>
            <h2>Direkt weiterarbeiten</h2>
            <p>Die laufenden Vorgänge des Vorstands – ohne Umweg in die einzelnen Module.</p>
          </div>
        </div>
        <div className="board-work-grid">
          {canMeetings && (
            <Link href="/sitzungen">
              <span>Sitzungen</span>
              <strong>{workOverview.meetings}</strong>
              <small>geplant oder laufend</small>
              <b>Öffnen →</b>
            </Link>
          )}
          {canResolutions && (
            <Link href="/beschluesse">
              <span>Beschlüsse</span>
              <strong>{workOverview.resolutions}</strong>
              <small>offen oder in Umsetzung</small>
              <b>Öffnen →</b>
            </Link>
          )}
          {canTasks && (
            <Link href="/aufgaben">
              <span>Aufgaben</span>
              <strong>{workOverview.tasks}</strong>
              <small>aktive Aufgaben</small>
              <b>Öffnen →</b>
            </Link>
          )}
          {canDocuments && (
            <Link href="/dokumente?view=review">
              <span>Dokumente</span>
              <strong>{workOverview.documents}</strong>
              <small>zur Prüfung</small>
              <b>Öffnen →</b>
            </Link>
          )}
        </div>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Aktuell</span>
            <h2>Besetzung</h2>
          </div>
          <span className="count-chip">{people.length}</span>
        </div>

        {people.length === 0 ? (
          <div className="empty-state">
            Noch keine Personen mit einer offiziellen Vereinsrolle hinterlegt.
          </div>
        ) : (
          <div className="board-structure-grid">
            {people.map((person) => (
              <article className="board-person-card" key={String(person.id)}>
                <div className="board-person-top">
                  <div className="member-avatar board-avatar">
                    {String(person.firstName).slice(0, 1)}
                    {String(person.lastName).slice(0, 1)}
                  </div>
                  <div className="board-person-name">
                    <span>{person.primaryRole ? roleLabel(String(person.primaryRole)) : "Funktion"}</span>
                    <strong>{String(person.firstName)} {String(person.lastName)}</strong>
                  </div>
                  <span className={person.userStatus === "active" ? "role-chip" : "status-badge status-disabled"}>
                    {person.userStatus === "active" ? "Login aktiv" : "Login deaktiviert"}
                  </span>
                </div>

                <p>
                  {officialRoleDefinitions.find((role) => role.key === person.primaryRole)?.description
                    ?? "Vereinsfunktion"}
                </p>

                {person.additionalRoles.length > 0 && (
                  <div className="board-additional-roles">
                    <span>Weitere Rollen</span>
                    <div>
                      {person.additionalRoles.map((role) => (
                        <b key={role}>{roleLabel(role)}</b>
                      ))}
                    </div>
                  </div>
                )}

                <div className="board-person-actions">
                  {person.memberId && (
                    <Link href={"/mitglieder/"+person.memberId} className="mini-button">
                      Mitglied öffnen
                    </Link>
                  )}
                  {canManage && (
                    <Link href="/admin/benutzer" className="mini-button">Rollen verwalten</Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </article>

      <details className="panel board-priority-panel board-secondary-drawer">
        <summary>
          <div>
            <span className="eyebrow">Struktur</span>
            <strong>Rollenreihenfolge</strong>
            <small>Festlegung der angezeigten Hauptrolle</small>
          </div>
          <b>+</b>
        </summary>
        <div className="board-secondary-body">
        <p className="board-priority-copy">
          Hat eine Person mehrere Rollen, wird die zuerst aufgeführte Rolle als Hauptrolle verwendet.
          Alle weiteren Rollen bleiben aktiv und werden als Zusatzrollen angezeigt.
        </p>
        <div className="board-role-order">
          {officialRoleDefinitions.map((role, index) => (
            <div key={role.key}>
              <span>{index + 1}</span>
              <div>
                <strong>{role.label}</strong>
                <small>{role.description}</small>
              </div>
            </div>
          ))}
        </div>
        </div>
      </details>

      {history.length > 0 && (
        <details className="panel board-secondary-drawer">
          <summary>
            <div>
              <span className="eyebrow">Historie</span>
              <strong>Frühere erfasste Ämter</strong>
              <small>{history.length} Einträge</small>
            </div>
            <b>+</b>
          </summary>
          <div className="board-secondary-body">
          <div className="data-list">
            {history.map((position) => (
              <div className="history-row" key={String(position.id)}>
                <div>
                  <strong>{String(position.title)}</strong>
                  <span>{String(position.firstName)} {String(position.lastName)}</span>
                </div>
                <span>{formatDate(position.startDate)} – {formatDate(position.endDate)}</span>
              </div>
            ))}
          </div>
          </div>
        </details>
      )}
    </div>
  );
}
