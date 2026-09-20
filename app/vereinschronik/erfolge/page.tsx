import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ChronicleNav } from "@/components/chronicle-nav";
import { createAchievementAction, deleteAchievementAction } from "@/app/vereinschronik/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic="force-dynamic";

function formatDate(value:unknown) {
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
}

export default async function AchievementsPage({
  searchParams,
}:{
  searchParams:Promise<Record<string,string|undefined>>;
}) {
  const user=await requirePermission("chronicle.read");
  const sql=getDb();
  const query=await searchParams;
  const canWrite=hasPermission(user.roles,"chronicle.write");

  const [achievements,members,teams]=sql ? await Promise.all([
    sql`
      SELECT
        a.id::text,a.achieved_on,a.category,a.title,a.description,
        m.first_name,m.last_name,t.name AS team_name
      FROM club_achievements a
      LEFT JOIN members m ON m.id=a.member_id
      LEFT JOIN teams t ON t.id=a.team_id
      ORDER BY a.achieved_on DESC,a.created_at DESC
    `,
    sql`
      SELECT id::text,first_name,last_name
      FROM members
      WHERE status <> 'inactive'
      ORDER BY last_name,first_name
    `,
    sql`
      SELECT id::text,name
      FROM teams
      WHERE deleted_at IS NULL
      ORDER BY name
    `,
  ]) : [[],[],[]];

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Vereinschronik</span>
          <h1>Vereinserfolge</h1>
          <p>Aufstiege, Meisterschaften, Pokalerfolge, Turniersiege und besondere Vereinsmomente.</p>
        </div>
      </section>

      <ChronicleNav active="achievements" />

      {(query.created || query.deleted) && <div className="form-success">Vereinserfolge wurden aktualisiert.</div>}
      {query.error && <div className="form-error">Der Erfolg konnte nicht gespeichert werden.</div>}

      <section className={canWrite ? "chronicle-manage-grid" : ""}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Erfolge</span><h2>Vereinsgeschichte</h2></div>
            <span className="count-chip">{achievements.length}</span>
          </div>

          {achievements.length===0 ? (
            <div className="empty-state">Noch keine Vereinserfolge eingetragen.</div>
          ) : (
            <div className="achievement-list">
              {achievements.map((achievement)=>(
                <article className="achievement-card" key={String(achievement.id)}>
                  <div className="achievement-date">{formatDate(achievement.achieved_on)}</div>
                  <div className="achievement-body">
                    <span>{String(achievement.category)}</span>
                    <h2>{String(achievement.title)}</h2>
                    {(achievement.team_name || achievement.first_name) && (
                      <div className="achievement-links">
                        {achievement.team_name && <b>{String(achievement.team_name)}</b>}
                        {achievement.first_name && <b>{String(achievement.first_name)} {String(achievement.last_name)}</b>}
                      </div>
                    )}
                    {achievement.description && <p>{String(achievement.description)}</p>}
                  </div>
                  {canWrite && (
                    <form action={deleteAchievementAction}>
                      <input type="hidden" name="id" value={String(achievement.id)} />
                      <ConfirmSubmitButton message={"Erfolg „"+String(achievement.title)+"“ löschen?"}>Löschen</ConfirmSubmitButton>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
        </article>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head">
              <div><span className="eyebrow">Neu</span><h2>Erfolg eintragen</h2></div>
            </div>
            <form action={createAchievementAction} className="form-stack">
              <label>Datum<input name="achievedOn" type="date" required /></label>
              <label>Kategorie
                <input name="category" list="achievement-categories" required placeholder="z. B. Aufstieg" />
                <datalist id="achievement-categories">
                  <option value="Aufstieg" />
                  <option value="Meisterschaft" />
                  <option value="Pokalerfolg" />
                  <option value="Turniersieg" />
                  <option value="Mannschaftserfolg" />
                  <option value="Spielererfolg" />
                  <option value="Vereinsrekord" />
                  <option value="Jubiläum" />
                </datalist>
              </label>
              <label>Titel<input name="title" required placeholder="z. B. Aufstieg in Liga 3A" /></label>
              <label>Beschreibung<textarea name="description" rows={4} /></label>
              <label>Mannschaft
                <select name="teamId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {teams.map((team)=><option key={String(team.id)} value={String(team.id)}>{String(team.name)}</option>)}
                </select>
              </label>
              <label>Spieler / Mitglied
                <select name="memberId" defaultValue="">
                  <option value="">Keine Zuordnung</option>
                  {members.map((member)=>(
                    <option key={String(member.id)} value={String(member.id)}>
                      {String(member.first_name)} {String(member.last_name)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button">Erfolg speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
