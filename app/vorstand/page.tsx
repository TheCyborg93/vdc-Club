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

  const [userRows, history] = sql
    ? await Promise.all([
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
      ])
    : [[], []];

  const people = userRows
    .map((row) => {
      const roles = sortedOfficialRoles(
        Array.isArray(row.roles) ? row.roles.map(String) : [],
      );
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
      return `${String(a.last_name)} ${String(a.first_name)}`.localeCompare(
        `${String(b.last_name)} ${String(b.first_name)}`,
        "de",
      );
    });

  const canManage = hasPermission(actor.roles, "settings.manage");
  const multipleRoles = people.filter((person) => person.additionalRoles.length > 0).length;
  const activeAccounts = people.filter((person) => person.user_status === "active").length;

  return (
    <div className="page-stack">
      <section className="page-heading board-heading">
        <div>
          <span className="eyebrow">Verein</span>
          <h1>Vorstandsstruktur</h1>
          <p>
            Personen werden automatisch aus den vergebenen Rollen übernommen. Bei mehreren Rollen
            bestimmt die festgelegte Reihenfolge die angezeigte Hauptrolle.
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
                    {String(person.first_name).slice(0, 1)}
                    {String(person.last_name).slice(0, 1)}
                  </div>
                  <div className="board-person-name">
                    <span>{person.primaryRole ? roleLabel(String(person.primaryRole)) : "Funktion"}</span>
                    <strong>{String(person.first_name)} {String(person.last_name)}</strong>
                  </div>
                  <span className={person.user_status === "active" ? "role-chip" : "status-badge status-disabled"}>
                    {person.user_status === "active" ? "Login aktiv" : "Login deaktiviert"}
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
              </article>
            ))}
          </div>
        )}
      </article>

      <section className="panel board-priority-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Priorität</span>
            <h2>Rollenreihenfolge</h2>
          </div>
        </div>
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
      </section>

      {history.length > 0 && (
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Historie</span>
              <h2>Frühere erfasste Ämter</h2>
            </div>
          </div>
          <div className="data-list">
            {history.map((position) => (
              <div className="history-row" key={String(position.id)}>
                <div>
                  <strong>{String(position.title)}</strong>
                  <span>{String(position.first_name)} {String(position.last_name)}</span>
                </div>
                <span>{formatDate(position.start_date)} – {formatDate(position.end_date)}</span>
              </div>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
