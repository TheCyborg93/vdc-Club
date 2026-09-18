import Link from "next/link";
import { getDb } from "@/lib/db";
import {
  revokeAdminUserSessionsAction,
  unlockAdminUserAction,
  updateAdminUserRolesAction,
  updateAdminUserStatusAction,
} from "@/app/admin/benutzer/actions";

export const dynamic = "force-dynamic";

const errors: Record<string,string> = {
  database:"Datenbank nicht verfügbar.",
  invalid:"Ungültige Eingabe.",
  self_lockout:"Du kannst deinen eigenen Adminzugang nicht deaktivieren.",
  last_admin:"Der letzte aktive Administrator kann nicht entfernt oder deaktiviert werden.",
  self_sessions:"Die eigene aktuelle Sitzung wird hier nicht widerrufen.",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string,string | undefined>>;
}) {
  const sql = getDb();
  const params = await searchParams;

  const [users, roles, stats, membersWithoutLogin] = sql
    ? await Promise.all([
        sql`
          SELECT
            u.id::text,
            u.member_id::text,
            u.email,
            u.display_name,
            u.status,
            u.last_login_at,
            u.failed_login_count,
            u.locked_until,
            m.first_name,
            m.last_name,
            COALESCE(array_agg(ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL),ARRAY[]::text[]) AS roles,
            (SELECT count(*)::int FROM user_sessions s WHERE s.user_id=u.id AND s.expires_at>now()) AS sessions
          FROM app_users u
          LEFT JOIN members m ON m.id=u.member_id
          LEFT JOIN user_roles ur ON ur.user_id=u.id
          GROUP BY u.id,m.id
          ORDER BY
            CASE WHEN 'admin'=ANY(COALESCE(array_agg(ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL),ARRAY[]::text[])) THEN 0 ELSE 1 END,
            u.display_name
        `,
        sql`SELECT key,name,description FROM roles ORDER BY name`,
        sql`
          SELECT
            count(*) FILTER (WHERE status='active')::int AS active,
            count(*) FILTER (WHERE status='disabled')::int AS disabled,
            count(*) FILTER (WHERE locked_until>now())::int AS locked,
            (
              SELECT count(DISTINCT u2.id)::int
              FROM app_users u2
              JOIN user_roles ur2 ON ur2.user_id=u2.id
              WHERE ur2.role_key='admin' AND u2.status='active'
            ) AS admins
          FROM app_users
        `,
        sql`
          SELECT id::text,first_name,last_name,email
          FROM members m
          WHERE NOT EXISTS (
            SELECT 1 FROM app_users u WHERE u.member_id=m.id
          )
          ORDER BY last_name,first_name
          LIMIT 12
        `,
      ])
    : [[],[],[{active:0,disabled:0,locked:0,admins:0}],[]];

  const s=stats[0] ?? {};

  return (
    <div className="page-stack">
      <section className="page-heading admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Benutzer & Rollen</h1>
          <p>Logins, Rollen, Sperren und aktive Sitzungen verwalten. Änderungen werden im Audit-Log protokolliert.</p>
        </div>
        <span className="admin-lock-chip">ADMIN</span>
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Aktion fehlgeschlagen."}</div>}
      {(params.updated || params.roles || params.unlocked || params.sessions) && (
        <div className="form-success">Benutzerverwaltung wurde aktualisiert.</div>
      )}

      <section className="stat-grid">
        <article className="stat-card"><span>Aktive Logins</span><strong>{Number(s.active ?? 0)}</strong><small>Benutzerkonten</small></article>
        <article className="stat-card"><span>Administratoren</span><strong>{Number(s.admins ?? 0)}</strong><small>aktive Admins</small></article>
        <article className="stat-card"><span>Deaktiviert</span><strong>{Number(s.disabled ?? 0)}</strong><small>kein Zugriff</small></article>
        <article className="stat-card"><span>Gesperrt</span><strong>{Number(s.locked ?? 0)}</strong><small>Login-Lockout</small></article>
      </section>

      <section className="admin-user-list">
        {users.map((user) => {
          const assigned = new Set(Array.isArray(user.roles) ? user.roles.map(String) : []);
          const locked = user.locked_until && new Date(String(user.locked_until)).getTime() > Date.now();
          return (
            <article className="panel admin-user-card" key={String(user.id)}>
              <div className="admin-user-head">
                <div className="member-avatar">
                  {String(user.display_name).split(/\s+/).slice(0,2).map((part)=>part[0]?.toUpperCase()).join("")}
                </div>
                <div>
                  <strong>{String(user.display_name)}</strong>
                  <span>{String(user.email)}</span>
                </div>
                <div className="admin-user-state">
                  <span className={`status-badge status-${user.status}`}>{String(user.status)}</span>
                  {locked && <span className="admin-warning-chip">Gesperrt</span>}
                </div>
              </div>

              <div className="admin-user-meta">
                <div><span>Letzter Login</span><strong>{user.last_login_at ? new Date(String(user.last_login_at)).toLocaleString("de-DE") : "Noch nie"}</strong></div>
                <div><span>Fehlversuche</span><strong>{Number(user.failed_login_count ?? 0)}</strong></div>
                <div><span>Aktive Sitzungen</span><strong>{Number(user.sessions ?? 0)}</strong></div>
                <div><span>Mitglied</span><strong>{user.member_id ? "Verknüpft" : "Ohne Mitglied"}</strong></div>
              </div>

              <form action={updateAdminUserRolesAction} className="admin-role-form">
                <input type="hidden" name="userId" value={String(user.id)} />
                <div className="checkbox-grid">
                  {roles.map((role) => (
                    <label className="checkbox-row" key={String(role.key)} title={String(role.description ?? "")}>
                      <input
                        type="checkbox"
                        name="roles"
                        value={String(role.key)}
                        defaultChecked={assigned.has(String(role.key))}
                      />
                      <span>{String(role.name)}</span>
                    </label>
                  ))}
                </div>
                <button className="primary-button">Rollen speichern</button>
              </form>

              <div className="admin-user-actions">
                <form action={updateAdminUserStatusAction}>
                  <input type="hidden" name="userId" value={String(user.id)} />
                  <input type="hidden" name="status" value={user.status === "active" ? "disabled" : "active"} />
                  <button className="mini-button">{user.status === "active" ? "Zugang deaktivieren" : "Zugang aktivieren"}</button>
                </form>
                {locked && (
                  <form action={unlockAdminUserAction}>
                    <input type="hidden" name="userId" value={String(user.id)} />
                    <button className="mini-button">Login entsperren</button>
                  </form>
                )}
                <form action={revokeAdminUserSessionsAction}>
                  <input type="hidden" name="userId" value={String(user.id)} />
                  <button className="mini-button">Sitzungen widerrufen</button>
                </form>
                {user.member_id && (
                  <Link href={`/mitglieder/${user.member_id}`} className="mini-button">Mitglied öffnen</Link>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {membersWithoutLogin.length > 0 && (
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Ohne Zugang</span><h2>Mitglieder ohne Benutzerkonto</h2></div>
            <span className="count-chip">{membersWithoutLogin.length}</span>
          </div>
          <div className="admin-member-link-grid">
            {membersWithoutLogin.map((member) => (
              <Link href={`/mitglieder/${member.id}`} key={String(member.id)}>
                <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                <span>{member.email ? String(member.email) : "Keine E-Mail hinterlegt"}</span>
              </Link>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
