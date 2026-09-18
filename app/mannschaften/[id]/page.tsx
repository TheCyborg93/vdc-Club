import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
import { teamStatusLabel } from "@/lib/ui-labels";
  addTeamMemberAction,
  removeTeamMemberAction,
  setTeamCaptainAction,
  updateTeamAction,
} from "@/app/mannschaften/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";

export const dynamic = "force-dynamic";

function formatDateTime(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; member?: string; captain?: string; removed?: string; created?: string }>;
}) {
  const actor = await requirePermission("teams.read");
  const sql = getDb();
  if (!sql) notFound();

  const { id } = await params;
  const query = await searchParams;
  const canWrite = hasPermission(actor.roles, "teams.write");
  const isAdmin = actor.roles.includes("admin");

  const [teamRows, roster, availableMembers, events] = await Promise.all([
    sql`
      SELECT
        id::text,name,short_name,league,season,status,venue,team_type,
        external_source,external_id
      FROM teams
      WHERE id = ${id}::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `,
    sql`
      SELECT
        m.id::text,
        m.first_name,
        m.last_name,
        m.member_number,
        m.email,
        tm.is_captain,
        u.id::text AS user_id
      FROM team_members tm
      JOIN members m ON m.id = tm.member_id
      LEFT JOIN app_users u ON u.member_id = m.id
      WHERE tm.team_id = ${id}::uuid
        AND tm.is_active = true
      ORDER BY tm.is_captain DESC, m.last_name, m.first_name
    `,
    sql`
      SELECT m.id::text,m.first_name,m.last_name
      FROM members m
      WHERE m.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM team_members tm
          WHERE tm.team_id = ${id}::uuid
            AND tm.member_id = m.id
            AND tm.is_active = true
        )
      ORDER BY m.last_name,m.first_name
    `,
    sql`
      SELECT id::text,title,starts_at,event_type,description
      FROM club_events
      WHERE team_id = ${id}::uuid
        AND deleted_at IS NULL
        AND starts_at >= now() - interval '1 day'
      ORDER BY starts_at
      LIMIT 8
    `,
  ]);

  const team = teamRows[0];
  if (!team) notFound();

  return (
    <div className="page-stack">
      <section className="meeting-hero">
        <div>
          <Link href="/mannschaften" className="back-link">← Mannschaften</Link>
          <span className="eyebrow">{team.season ? `Saison ${team.season}` : "Mannschaft"}</span>
          <h1>{String(team.name)}</h1>
          <p>{team.league ? String(team.league) : "Noch keiner Liga zugeordnet"}</p>
        </div>
        <div className="meeting-hero-side">
          {isAdmin && team.external_source === "vdc_tc" && <span className="sync-chip">VDC‑TC verbunden</span>}
          <b className={`status-badge status-${team.status}`}>{teamStatusLabel(team.status)}</b>
        </div>
      </section>

      {query.error && (
        <div className="form-error">
          {query.error==="team_delete"
            ? "Diese Mannschaft enthält bereits Kader-, Termin- oder Importhistorie und kann nicht in den Papierkorb verschoben werden. Nutze stattdessen den Status „Archiviert“."
            : "Die Änderung konnte nicht gespeichert werden."}
        </div>
      )}
      {(query.saved || query.member || query.captain || query.removed || query.created) && <div className="form-success">Mannschaft wurde aktualisiert.</div>}

      <section className="meeting-summary-grid">
        <article><span>Kader</span><strong>{roster.length}</strong><small>aktive Spieler</small></article>
        <article><span>Captains</span><strong>{roster.filter((r) => r.is_captain).length}</strong><small>markiert</small></article>
        <article><span>Termine</span><strong>{events.length}</strong><small>kommende Spiele</small></article>
        {isAdmin
          ? <article><span>Quelle</span><strong>{team.external_source === "vdc_tc" ? "TC" : "Club"}</strong><small>{team.external_id ? "synchronisiert" : "lokal"}</small></article>
          : <article><span>Saison</span><strong>{team.season ? String(team.season) : "–"}</strong><small>aktueller Spielbetrieb</small></article>}
      </section>

      <section className="team-detail-grid">
        <div className="team-detail-main">
          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Kader</span><h2>Spieler</h2></div><span className="count-chip">{roster.length}</span></div>
            <div className="data-list">
              {roster.length === 0 ? <div className="empty-state">Noch keine Spieler zugeordnet.</div> : roster.map((member) => (
                <div className="roster-row" key={String(member.id)}>
                  <div className="member-avatar">{String(member.first_name).slice(0,1)}{String(member.last_name).slice(0,1)}</div>
                  <div className="member-main">
                    <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                    <span>
                      {member.member_number ? `#${member.member_number}` : "Keine Mitgliedsnummer"}
                      {member.email ? ` · ${member.email}` : ""}
                    </span>
                  </div>
                  <div className="roster-role">
                    {member.is_captain ? <span className="captain-chip">Team Captain</span> : <span>Spieler</span>}
                    {member.user_id ? <small>Login aktiv</small> : <small>Kein Login</small>}
                  </div>
                  {canWrite && (
                    <div className="roster-actions">
                      <form action={setTeamCaptainAction}>
                        <input type="hidden" name="teamId" value={id} />
                        <input type="hidden" name="memberId" value={String(member.id)} />
                        <input type="hidden" name="isCaptain" value={member.is_captain ? "false" : "true"} />
                        <button className="mini-button">{member.is_captain ? "Captain entfernen" : "Zum Captain"}</button>
                      </form>
                      <form action={removeTeamMemberAction}>
                        <input type="hidden" name="teamId" value={id} />
                        <input type="hidden" name="memberId" value={String(member.id)} />
                        <button className="mini-button">Aus Kader</button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Spielplan</span><h2>Kommende Termine</h2></div></div>
            <div className="calendar-list">
              {events.length === 0 ? <div className="empty-state">Keine kommenden Spieltage.</div> : events.map((event) => (
                <div className="calendar-event" key={String(event.id)}>
                  <div className={`event-type-dot event-${event.event_type}`} />
                  <div className="calendar-event-main">
                    <strong>{String(event.title)}</strong>
                    <span>{formatDateTime(event.starts_at)}</span>
                    {event.description && <small>{String(event.description)}</small>}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <aside className="team-detail-side">
          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Daten</span><h2>Mannschaft</h2></div></div>
            <form action={updateTeamAction} className="form-stack">
              <input type="hidden" name="id" value={id} />
              <label>Name<input name="name" defaultValue={String(team.name)} disabled={!canWrite} required /></label>
              <div className="form-grid">
                <label>Kurzname<input name="shortName" defaultValue={team.short_name ? String(team.short_name) : ""} disabled={!canWrite} /></label>
                <label>Typ
                  <select name="teamType" defaultValue={team.team_type ? String(team.team_type) : ""} disabled={!canWrite}>
                    <option value="">Keine Zuordnung</option>
                    <option value="first">1. Mannschaft</option>
                    <option value="second">2. Mannschaft</option>
                    <option value="other">Weitere Mannschaft</option>
                  </select>
                </label>
              </div>
              <label>Liga<input name="league" defaultValue={team.league ? String(team.league) : ""} disabled={!canWrite} /></label>
              <label>Saison<input name="season" defaultValue={team.season ? String(team.season) : ""} disabled={!canWrite} /></label>
              <label>Spielstätte<input name="venue" defaultValue={team.venue ? String(team.venue) : ""} disabled={!canWrite} /></label>
              <label>Status
                <select name="status" defaultValue={String(team.status)} disabled={!canWrite}>
                  <option value="active">Aktiv</option>
                  <option value="archived">Archiviert</option>
                </select>
              </label>
              {canWrite && <button className="primary-button">Änderungen speichern</button>}
            </form>

            {canWrite && roster.length===0 && !team.external_source && !team.external_id && (
              <form action={moveToTrashAction} className="destructive-inline-form">
                <input type="hidden" name="type" value="team" />
                <input type="hidden" name="id" value={id} />
                <ConfirmSubmitButton
                  message={"Mannschaft „"+String(team.name)+"“ in den Papierkorb verschieben? Kader-, Termin- oder Importhistorie schützt die Mannschaft automatisch."}
                >
                  Mannschaft löschen
                </ConfirmSubmitButton>
              </form>
            )}
          </article>

          {canWrite && availableMembers.length > 0 && (
            <article className="panel">
              <div className="panel-head"><div><span className="eyebrow">Kader</span><h2>Spieler hinzufügen</h2></div></div>
              <form action={addTeamMemberAction} className="form-stack">
                <input type="hidden" name="teamId" value={id} />
                <label>Mitglied
                  <select name="memberId" defaultValue="" required>
                    <option value="" disabled>Mitglied auswählen</option>
                    {availableMembers.map((member) => (
                      <option key={String(member.id)} value={String(member.id)}>
                        {String(member.first_name)} {String(member.last_name)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button">Zum Kader hinzufügen</button>
              </form>
            </article>
          )}
        </aside>
      </section>
    </div>
  );
}
