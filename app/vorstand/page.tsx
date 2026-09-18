import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  createBoardPositionAction,
  endBoardPositionAction,
} from "@/app/vorstand/actions";

const errors: Record<string, string> = {
  database: "Die Datenbankverbindung fehlt.",
  missing: "Mitglied, Funktion und Amtsbeginn sind erforderlich.",
};

export const dynamic = "force-dynamic";

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE").format(date);
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; ended?: string }>;
}) {
  const actor = await requirePermission("members.read");
  const sql = getDb();
  const params = await searchParams;

  const [positions, members, roles, history] = sql
    ? await Promise.all([
        sql`
          SELECT
            bp.id::text,
            bp.title,
            bp.role_key,
            bp.start_date,
            m.id::text AS member_id,
            m.first_name,
            m.last_name,
            u.status AS user_status
          FROM board_positions bp
          JOIN members m ON m.id = bp.member_id
          LEFT JOIN app_users u ON u.member_id = m.id
          WHERE bp.is_active = true
          ORDER BY bp.start_date, bp.title
        `,
        sql`
          SELECT id::text, first_name, last_name
          FROM members
          WHERE status = 'active'
          ORDER BY last_name, first_name
        `,
        sql`
          SELECT key, name
          FROM roles
          WHERE key IN ('chair','vice_chair','treasurer','secretary','sport_director','board')
          ORDER BY name
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
    : [[], [], [], []];

  const canManage = hasPermission(actor.roles, "settings.manage");
  const accounts = positions.filter((row) => row.user_status === "active").length;

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Verein</span>
          <h1>Vorstand & Rollen</h1>
          <p>Aktuelle Funktionen, Amtszeiten und zugehörige Systemrollen zentral verwalten.</p>
        </div>
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(params.created || params.ended) && <div className="form-success">Vorstandsstruktur wurde aktualisiert.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Aktive Funktionen</span><strong>{positions.length}</strong><small>aktuell besetzt</small></article>
        <article className="stat-card"><span>Mit Benutzerzugang</span><strong>{accounts}</strong><small>VDC Club aktiv</small></article>
        <article className="stat-card"><span>Rollenarten</span><strong>{roles.length}</strong><small>Vorstandsrollen</small></article>
        <article className="stat-card"><span>Historie</span><strong>{history.length}</strong><small>zuletzt beendete Ämter</small></article>
      </section>

      <section className={canManage ? "management-grid" : "management-grid single"}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Aktuell</span><h2>Vorstandsstruktur</h2></div>
          </div>
          <div className="data-list">
            {positions.length === 0 ? (
              <div className="empty-state">Noch keine Vorstandsfunktionen hinterlegt.</div>
            ) : positions.map((position) => (
              <div className="board-row" key={String(position.id)}>
                <div className="member-avatar">
                  {String(position.first_name).slice(0,1)}{String(position.last_name).slice(0,1)}
                </div>
                <div className="member-main">
                  <strong>{String(position.title)}</strong>
                  <span>{String(position.first_name)} {String(position.last_name)} · seit {formatDate(position.start_date)}</span>
                </div>
                <div className="board-actions">
                  {position.user_status === "active" && <span className="role-chip">Login aktiv</span>}
                  {canManage && (
                    <form action={endBoardPositionAction}>
                      <input type="hidden" name="id" value={String(position.id)} />
                      <button className="mini-button" type="submit">Amt beenden</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>

        {canManage && (
          <article className="panel sticky-panel">
            <div className="panel-head"><div><span className="eyebrow">Zuweisen</span><h2>Neue Funktion</h2></div></div>
            <form action={createBoardPositionAction} className="form-stack">
              <label>Mitglied
                <select name="memberId" required defaultValue="">
                  <option value="" disabled>Mitglied auswählen</option>
                  {members.map((member) => (
                    <option key={String(member.id)} value={String(member.id)}>
                      {String(member.first_name)} {String(member.last_name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>Funktion<input name="title" placeholder="z. B. 1. Vorsitz" required /></label>
              <label>Systemrolle
                <select name="roleKey" defaultValue="">
                  <option value="">Nur Vorstandsfunktion</option>
                  {roles.map((role) => (
                    <option key={String(role.key)} value={String(role.key)}>{String(role.name)}</option>
                  ))}
                </select>
              </label>
              <label>Amtsbeginn<input name="startDate" type="date" required /></label>
              <button className="primary-button" type="submit">Funktion zuweisen</button>
            </form>
          </article>
        )}
      </section>

      <article className="panel">
        <div className="panel-head"><div><span className="eyebrow">Historie</span><h2>Beendete Funktionen</h2></div></div>
        <div className="data-list">
          {history.length === 0 ? (
            <div className="empty-state">Noch keine historischen Vorstandsfunktionen.</div>
          ) : history.map((position) => (
            <div className="history-row" key={String(position.id)}>
              <div><strong>{String(position.title)}</strong><span>{String(position.first_name)} {String(position.last_name)}</span></div>
              <span>{formatDate(position.start_date)} – {formatDate(position.end_date)}</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
