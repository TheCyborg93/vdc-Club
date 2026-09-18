import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { createMemberAction } from "@/app/mitglieder/actions";

const errors: Record<string, string> = {
  database: "Die Datenbankverbindung fehlt.",
  missing: "Vor- und Nachname sind erforderlich.",
  duplicate: "Mitgliedsnummer oder andere eindeutige Daten sind bereits vergeben.",
};

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const user = await requirePermission("members.read");
  const sql = getDb();
  const params = await searchParams;

  const [members, counts] = sql
    ? await Promise.all([
        sql`
          SELECT
            m.id::text,
            m.member_number,
            m.first_name,
            m.last_name,
            m.email,
            m.status,
            m.join_date,
            COALESCE(
              string_agg(DISTINCT t.name, ', ') FILTER (WHERE t.id IS NOT NULL),
              ''
            ) AS teams
          FROM members m
          LEFT JOIN team_members tm ON tm.member_id = m.id AND tm.is_active = true
          LEFT JOIN teams t ON t.id = tm.team_id AND t.status = 'active'
          GROUP BY m.id
          ORDER BY m.last_name, m.first_name
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status = 'active')::int AS active,
            count(*) FILTER (WHERE join_date >= DATE '2026-07-01')::int AS new_season,
            (SELECT count(*)::int FROM board_positions WHERE is_active = true) AS board_count,
            (SELECT count(*)::int FROM team_members WHERE is_captain = true AND is_active = true) AS captain_count
          FROM members
        `,
      ])
    : [[], [{ active: 0, new_season: 0, board_count: 0, captain_count: 0 }]];

  const count = counts[0] ?? {};
  const canWrite = hasPermission(user.roles, "members.write");

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Verein</span>
          <h1>Mitglieder</h1>
          <p>Zentrale Mitgliederdaten, Mannschaften, Funktionen und Benutzerzugänge.</p>
        </div>
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {params.created && <div className="form-success">Mitglied wurde angelegt.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Aktive Mitglieder</span><strong>{Number(count.active ?? 0)}</strong><small>aktueller Bestand</small></article>
        <article className="stat-card"><span>Neue Mitglieder</span><strong>{Number(count.new_season ?? 0)}</strong><small>Saison 2026/27</small></article>
        <article className="stat-card"><span>Vorstand</span><strong>{Number(count.board_count ?? 0)}</strong><small>aktive Funktionen</small></article>
        <article className="stat-card"><span>Team Captains</span><strong>{Number(count.captain_count ?? 0)}</strong><small>aktive Zuordnungen</small></article>
      </section>

      <section className={canWrite ? "management-grid" : "management-grid single"}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Bestand</span><h2>Mitgliederliste</h2></div>
            <span className="count-chip">{members.length}</span>
          </div>
          <div className="data-list">
            {members.length === 0 ? (
              <div className="empty-state">Noch keine Mitglieder vorhanden.</div>
            ) : members.map((member) => (
              <Link className="member-row" key={String(member.id)} href={`/mitglieder/${member.id}`}>
                <div className="member-avatar">
                  {String(member.first_name).slice(0,1)}{String(member.last_name).slice(0,1)}
                </div>
                <div className="member-main">
                  <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                  <span>
                    {member.member_number ? `#${member.member_number} · ` : ""}
                    {member.email ? String(member.email) : "Keine E-Mail"}
                  </span>
                </div>
                <div className="member-meta">
                  <span>{member.teams ? String(member.teams) : "Keine Mannschaft"}</span>
                  <b className={`status-badge status-${member.status}`}>{String(member.status)}</b>
                </div>
              </Link>
            ))}
          </div>
        </article>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head">
              <div><span className="eyebrow">Neu</span><h2>Mitglied anlegen</h2></div>
            </div>
            <form action={createMemberAction} className="form-stack">
              <div className="form-grid">
                <label>Vorname<input name="firstName" required /></label>
                <label>Nachname<input name="lastName" required /></label>
              </div>
              <label>E-Mail<input name="email" type="email" /></label>
              <div className="form-grid">
                <label>Mitgliedsnummer<input name="memberNumber" /></label>
                <label>Eintritt<input name="joinDate" type="date" /></label>
              </div>
              <label>Status
                <select name="status" defaultValue="active">
                  <option value="active">Aktiv</option>
                  <option value="passive">Passiv</option>
                  <option value="inactive">Inaktiv</option>
                </select>
              </label>
              <button className="primary-button" type="submit">Mitglied speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
