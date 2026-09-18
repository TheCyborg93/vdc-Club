import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { createMemberAction } from "@/app/mitglieder/actions";

const errors: Record<string, string> = {
  database: "Die Datenbankverbindung fehlt.",
  missing: "Vor- und Nachname sind erforderlich.",
  duplicate: "Mitgliedsnummer oder andere eindeutige Daten sind bereits vergeben.",
};

const statusLabels: Record<string,string> = {
  active:"Aktiv",
  passive:"Passiv",
  inactive:"Inaktiv",
};

const membershipTypeLabels: Record<string,string> = {
  regular:"Regulär",
  youth:"Jugend",
  honorary:"Ehrenmitglied",
  other:"Sonstige",
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
            m.membership_type,
            m.join_date,
            m.notice_date,
            m.leave_date,
            COALESCE(
              string_agg(DISTINCT t.short_name, ', ') FILTER (WHERE t.id IS NOT NULL),
              ''
            ) AS teams
          FROM members m
          LEFT JOIN team_members tm ON tm.member_id = m.id AND tm.is_active = true
          LEFT JOIN teams t ON t.id = tm.team_id AND t.status = 'active'
          GROUP BY m.id
          ORDER BY
            CASE m.status WHEN 'active' THEN 0 WHEN 'passive' THEN 1 ELSE 2 END,
            m.last_name, m.first_name
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status = 'active')::int AS active,
            count(*) FILTER (WHERE status = 'passive')::int AS passive,
            count(*) FILTER (
              WHERE join_date >= date_trunc('year',CURRENT_DATE)::date
            )::int AS joined_year,
            count(*) FILTER (
              WHERE notice_date IS NOT NULL
                AND (leave_date IS NULL OR leave_date >= CURRENT_DATE)
            )::int AS notices
          FROM members
        `,
      ])
    : [[], [{ active: 0, passive: 0, joined_year: 0, notices: 0 }]];

  const count = counts[0] ?? {};
  const canWrite = hasPermission(user.roles, "members.write");

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Verein</span>
          <h1>Mitglieder</h1>
          <p>Zentrale Mitgliederdaten mit Status, Mitgliedsart, Eintritt, Kündigung und Mannschaftszuordnung.</p>
        </div>
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {params.created && <div className="form-success">Mitglied wurde angelegt.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Aktive Mitglieder</span><strong>{Number(count.active ?? 0)}</strong><small>aktueller Bestand</small></article>
        <article className="stat-card"><span>Passive Mitglieder</span><strong>{Number(count.passive ?? 0)}</strong><small>aktueller Bestand</small></article>
        <article className="stat-card"><span>Eintritte</span><strong>{Number(count.joined_year ?? 0)}</strong><small>dieses Jahr</small></article>
        <article className="stat-card"><span>Kündigungen</span><strong>{Number(count.notices ?? 0)}</strong><small>vorgemerkt</small></article>
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
                    {membershipTypeLabels[String(member.membership_type ?? "regular")] ?? "Mitglied"}
                    {member.teams ? ` · ${member.teams}` : ""}
                  </span>
                  {member.notice_date && (
                    <small className="member-notice">
                      Kündigung {member.leave_date ? `zum ${new Intl.DateTimeFormat("de-DE").format(new Date(String(member.leave_date)))}` : "vorgemerkt"}
                    </small>
                  )}
                </div>
                <div className="member-meta">
                  <span>{member.email ? String(member.email) : "Keine E-Mail"}</span>
                  <b className={`status-badge status-${member.status}`}>{statusLabels[String(member.status)] ?? String(member.status)}</b>
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
              <div className="form-grid">
                <label>Mitgliedsart
                  <select name="membershipType" defaultValue="regular">
                    <option value="regular">Regulär</option>
                    <option value="youth">Jugend</option>
                    <option value="honorary">Ehrenmitglied</option>
                    <option value="other">Sonstige</option>
                  </select>
                </label>
                <label>Status
                  <select name="status" defaultValue="active">
                    <option value="active">Aktiv</option>
                    <option value="passive">Passiv</option>
                    <option value="inactive">Inaktiv</option>
                  </select>
                </label>
              </div>
              <button className="primary-button" type="submit">Mitglied speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
