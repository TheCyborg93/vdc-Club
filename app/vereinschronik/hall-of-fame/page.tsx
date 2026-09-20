import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ChronicleNav } from "@/components/chronicle-nav";
import { createHonorAction, deleteHonorAction } from "@/app/vereinschronik/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic="force-dynamic";

const typeLabels:Record<string,string>={
  club_champion:"Vereinsmeister",
  christmas_champion:"Weihnachtsmeister",
  other:"Weiterer Titel",
};

function formatDate(value:unknown) {
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
}

export default async function HallOfFamePage({
  searchParams,
}:{
  searchParams:Promise<Record<string,string|undefined>>;
}) {
  const user=await requirePermission("chronicle.read");
  const sql=getDb();
  const query=await searchParams;
  const canWrite=hasPermission(user.roles,"chronicle.write");

  const [honors,members]=sql ? await Promise.all([
    sql`
      SELECT
        h.id::text,h.honor_type,h.custom_title,h.year,h.event_date,
        h.winner_name,h.runner_up_name,h.third_place_name,h.participants,h.notes
      FROM club_honors h
      ORDER BY h.year DESC,
        CASE h.honor_type WHEN 'club_champion' THEN 0 WHEN 'christmas_champion' THEN 1 ELSE 2 END,
        h.event_date DESC NULLS LAST
    `,
    sql`
      SELECT id::text,first_name,last_name
      FROM members
      WHERE status <> 'inactive'
      ORDER BY last_name,first_name
    `,
  ]) : [[],[]];

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Vereinschronik</span>
          <h1>Hall of Fame</h1>
          <p>Vereinsmeister, Weihnachtsmeister und weitere vereinsinterne Titel nach Jahr.</p>
        </div>
      </section>

      <ChronicleNav active="hall" />

      {(query.created || query.deleted) && (
        <div className="form-success">Hall of Fame wurde aktualisiert.</div>
      )}
      {query.error && <div className="form-error">Der Eintrag konnte nicht gespeichert werden.</div>}

      <section className={canWrite ? "chronicle-manage-grid" : ""}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Titelträger</span><h2>Alle Meister & Titel</h2></div>
            <span className="count-chip">{honors.length}</span>
          </div>

          {honors.length===0 ? (
            <div className="empty-state">Noch keine Titel eingetragen.</div>
          ) : (
            <div className="hall-grid">
              {honors.map((honor)=>(
                <article className="hall-card" key={String(honor.id)}>
                  <div className="hall-year">{String(honor.year)}</div>
                  <div className="hall-body">
                    <span>{honor.honor_type==="other" ? String(honor.custom_title || "Titel") : typeLabels[String(honor.honor_type)]}</span>
                    <h2>{String(honor.winner_name)}</h2>
                    <div className="hall-meta">
                      {honor.event_date && <small>{formatDate(honor.event_date)}</small>}
                      {honor.participants!=null && <small>{Number(honor.participants)} Teilnehmer</small>}
                    </div>
                    {(honor.runner_up_name || honor.third_place_name) && (
                      <div className="hall-places">
                        {honor.runner_up_name && <div><span>2. Platz</span><strong>{String(honor.runner_up_name)}</strong></div>}
                        {honor.third_place_name && <div><span>3. Platz</span><strong>{String(honor.third_place_name)}</strong></div>}
                      </div>
                    )}
                    {honor.notes && <p>{String(honor.notes)}</p>}
                    {canWrite && (
                      <form action={deleteHonorAction}>
                        <input type="hidden" name="id" value={String(honor.id)} />
                        <ConfirmSubmitButton message={"Titel von "+String(honor.winner_name)+" aus "+String(honor.year)+" löschen?"}>
                          Löschen
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head">
              <div><span className="eyebrow">Neu</span><h2>Titel eintragen</h2></div>
            </div>
            <form action={createHonorAction} className="form-stack">
              <label>Titelart
                <select name="honorType" defaultValue="club_champion">
                  <option value="club_champion">Vereinsmeister</option>
                  <option value="christmas_champion">Weihnachtsmeister</option>
                  <option value="other">Anderer Titel</option>
                </select>
              </label>
              <label>Eigene Titelbezeichnung
                <input name="customTitle" placeholder="Nur bei anderem Titel, z. B. Sommermeister" />
              </label>
              <div className="form-grid">
                <label>Jahr<input name="year" type="number" min="1900" max="2200" defaultValue={new Date().getFullYear()} required /></label>
                <label>Turnierdatum<input name="eventDate" type="date" /></label>
              </div>
              <label>Sieger / Titelträger<input name="winnerName" required placeholder="Vor- und Nachname" /></label>
              <label>Mitglied verknüpfen
                <select name="winnerMemberId" defaultValue="">
                  <option value="">Keine Verknüpfung</option>
                  {members.map((member)=>(
                    <option key={String(member.id)} value={String(member.id)}>
                      {String(member.first_name)} {String(member.last_name)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>2. Platz<input name="runnerUpName" /></label>
                <label>3. Platz<input name="thirdPlaceName" /></label>
              </div>
              <label>Teilnehmerzahl<input name="participants" type="number" min="0" /></label>
              <label>Notiz<textarea name="notes" rows={4} placeholder="Finalergebnis, Besonderheiten, Shortleg …" /></label>
              <button className="primary-button">Titel speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
