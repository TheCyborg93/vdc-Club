import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ChronicleNav } from "@/components/chronicle-nav";
import { createHonorAction } from "@/app/vereinschronik/actions";

export const dynamic="force-dynamic";

type HonorRow = {
  id:string;
  honorType:string;
  customTitle:string;
  year:number;
  eventDate:unknown;
  winnerName:string;
  runnerUpName:string;
  thirdPlaceName:string;
  participants:number|null;
  tournamentFormat:string;
  venue:string;
  finalScore:string;
  highFinish:number|null;
  shortLeg:number|null;
  average:number|null;
  albumId:string;
  notes:string;
};

type WinnerRecord = {
  winnerName:string;
  titles:number;
  clubTitles:number;
  christmasTitles:number;
  otherTitles:number;
  firstYear:number;
  latestYear:number;
};

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

function honorLabel(honor:HonorRow) {
  return honor.honorType==="other"
    ? honor.customTitle || "Weiterer Titel"
    : typeLabels[honor.honorType] ?? honor.honorType;
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

  let honors:HonorRow[]=[];
  let members:Array<{id:string;firstName:string;lastName:string}>=[];
  let albums:Array<{id:string;title:string}>=[];
  let records:WinnerRecord[]=[];

  if (sql) {
    const [rawHonors,rawMembers,rawAlbums,rawRecords]=await Promise.all([
      sql`
        SELECT
          h.id::text,h.honor_type,h.custom_title,h.year,h.event_date,
          h.winner_name,h.runner_up_name,h.third_place_name,h.participants,
          h.tournament_format,h.venue,h.final_score,h.high_finish,h.short_leg,
          h.average,h.album_id::text,h.notes
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
      sql`
        SELECT id::text,title
        FROM club_photo_albums
        ORDER BY COALESCE(event_date,created_at::date) DESC,title
      `,
      sql`
        SELECT
          winner_name,
          count(*)::int AS titles,
          count(*) FILTER (WHERE honor_type='club_champion')::int AS club_titles,
          count(*) FILTER (WHERE honor_type='christmas_champion')::int AS christmas_titles,
          count(*) FILTER (WHERE honor_type='other')::int AS other_titles,
          min(year)::int AS first_year,
          max(year)::int AS latest_year
        FROM club_honors
        GROUP BY winner_name
        ORDER BY titles DESC,latest_year DESC,winner_name
      `,
    ]);

    honors=rawHonors.map((row)=>({
      id:String(row.id),
      honorType:String(row.honor_type),
      customTitle:String(row.custom_title ?? ""),
      year:Number(row.year),
      eventDate:row.event_date,
      winnerName:String(row.winner_name),
      runnerUpName:String(row.runner_up_name ?? ""),
      thirdPlaceName:String(row.third_place_name ?? ""),
      participants:row.participants==null ? null : Number(row.participants),
      tournamentFormat:String(row.tournament_format ?? ""),
      venue:String(row.venue ?? ""),
      finalScore:String(row.final_score ?? ""),
      highFinish:row.high_finish==null ? null : Number(row.high_finish),
      shortLeg:row.short_leg==null ? null : Number(row.short_leg),
      average:row.average==null ? null : Number(row.average),
      albumId:String(row.album_id ?? ""),
      notes:String(row.notes ?? ""),
    }));

    members=rawMembers.map((row)=>({
      id:String(row.id),
      firstName:String(row.first_name),
      lastName:String(row.last_name),
    }));

    albums=rawAlbums.map((row)=>({
      id:String(row.id),
      title:String(row.title),
    }));

    records=rawRecords.map((row)=>({
      winnerName:String(row.winner_name),
      titles:Number(row.titles),
      clubTitles:Number(row.club_titles),
      christmasTitles:Number(row.christmas_titles),
      otherTitles:Number(row.other_titles),
      firstYear:Number(row.first_year),
      latestYear:Number(row.latest_year),
    }));
  }

  const currentClub=honors.find((honor)=>honor.honorType==="club_champion") ?? null;
  const currentChristmas=honors.find((honor)=>honor.honorType==="christmas_champion") ?? null;
  const uniqueWinners=records.length;
  const multiWinners=records.filter((record)=>record.titles>1);
  const recordTitles=records[0]?.titles ?? 0;

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Vereinschronik</span>
          <h1>Hall of Fame</h1>
          <p>Meister, Titelträger, Rekorde und die Geschichte der vereinsinternen Wettbewerbe.</p>
        </div>
      </section>

      <ChronicleNav active="hall" />

      {(query.created || query.deleted) && (
        <div className="form-success">Hall of Fame wurde aktualisiert.</div>
      )}
      {query.error && <div className="form-error">Der Eintrag konnte nicht gespeichert werden.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Titel</span><strong>{honors.length}</strong><small>insgesamt dokumentiert</small></article>
        <article className="stat-card"><span>Titelträger</span><strong>{uniqueWinners}</strong><small>verschiedene Sieger</small></article>
        <article className="stat-card"><span>Mehrfachsieger</span><strong>{multiWinners.length}</strong><small>mit mindestens 2 Titeln</small></article>
        <article className="stat-card"><span>Rekord</span><strong>{recordTitles}</strong><small>meiste dokumentierte Titel</small></article>
      </section>

      {(currentClub || currentChristmas) && (
        <section className="hall-feature-grid">
          {currentClub && (
            <Link href={`/vereinschronik/hall-of-fame/${currentClub.id}`} className="hall-feature-card">
              <span>Aktueller Vereinsmeister</span>
              <strong>{currentClub.winnerName}</strong>
              <small>{currentClub.year}{currentClub.finalScore ? ` · Finale ${currentClub.finalScore}` : ""}</small>
            </Link>
          )}
          {currentChristmas && (
            <Link href={`/vereinschronik/hall-of-fame/${currentChristmas.id}`} className="hall-feature-card">
              <span>Aktueller Weihnachtsmeister</span>
              <strong>{currentChristmas.winnerName}</strong>
              <small>{currentChristmas.year}{currentChristmas.finalScore ? ` · Finale ${currentChristmas.finalScore}` : ""}</small>
            </Link>
          )}
        </section>
      )}

      {records.length>0 && (
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Rekorde</span><h2>Erfolgreichste Titelträger</h2></div>
          </div>
          <div className="hall-record-grid">
            {records.slice(0,8).map((record,index)=>(
              <div className="hall-record-card" key={record.winnerName}>
                <b>{index+1}</b>
                <div>
                  <strong>{record.winnerName}</strong>
                  <span>{record.firstYear===record.latestYear ? record.latestYear : `${record.firstYear}–${record.latestYear}`}</span>
                </div>
                <div>
                  <strong>{record.titles}</strong>
                  <span>Titel</span>
                </div>
                <small>
                  {record.clubTitles}× Vereinsmeister · {record.christmasTitles}× Weihnachten
                  {record.otherTitles ? ` · ${record.otherTitles}× weitere` : ""}
                </small>
              </div>
            ))}
          </div>
        </article>
      )}

      <section className={canWrite ? "chronicle-manage-grid" : ""}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Titelhistorie</span><h2>Alle Meister & Titel</h2></div>
            <span className="count-chip">{honors.length}</span>
          </div>

          {honors.length===0 ? (
            <div className="empty-state">Noch keine Titel eingetragen.</div>
          ) : (
            <div className="hall-grid">
              {honors.map((honor)=>(
                <Link
                  href={`/vereinschronik/hall-of-fame/${honor.id}`}
                  className="hall-card hall-card-link"
                  key={honor.id}
                >
                  <div className="hall-year">{honor.year}</div>
                  <div className="hall-body">
                    <span>{honorLabel(honor)}</span>
                    <h2>{honor.winnerName}</h2>
                    <div className="hall-meta">
                      {Boolean(honor.eventDate) && <small>{formatDate(honor.eventDate)}</small>}
                      {honor.participants!=null && <small>{honor.participants} Teilnehmer</small>}
                      {honor.finalScore && <small>Finale {honor.finalScore}</small>}
                    </div>
                    {(honor.runnerUpName || honor.thirdPlaceName) && (
                      <div className="hall-places">
                        {honor.runnerUpName && <div><span>2. Platz</span><strong>{honor.runnerUpName}</strong></div>}
                        {honor.thirdPlaceName && <div><span>3. Platz</span><strong>{honor.thirdPlaceName}</strong></div>}
                      </div>
                    )}
                    <div className="hall-performance-chips">
                      {honor.average!=null && <span>AVG {honor.average.toFixed(2)}</span>}
                      {honor.highFinish!=null && <span>HF {honor.highFinish}</span>}
                      {honor.shortLeg!=null && <span>SL {honor.shortLeg}</span>}
                      {honor.albumId && <span>📷 Album</span>}
                    </div>
                  </div>
                </Link>
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
                <input name="customTitle" placeholder="z. B. Sommermeister" />
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
                    <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>2. Platz<input name="runnerUpName" /></label>
                <label>3. Platz<input name="thirdPlaceName" /></label>
              </div>
              <div className="form-grid">
                <label>Teilnehmerzahl<input name="participants" type="number" min="0" /></label>
                <label>Turnierformat<input name="tournamentFormat" placeholder="z. B. Gruppen + K.O." /></label>
              </div>
              <div className="form-grid">
                <label>Spielort<input name="venue" placeholder="z. B. Vereinsheim" /></label>
                <label>Finalergebnis<input name="finalScore" placeholder="z. B. 3:0" /></label>
              </div>
              <div className="form-grid">
                <label>High Finish<input name="highFinish" type="number" min="0" max="170" /></label>
                <label>Shortleg<input name="shortLeg" type="number" min="9" max="99" /></label>
              </div>
              <label>Turnier-/Final-Average<input name="average" inputMode="decimal" placeholder="z. B. 62,45" /></label>
              <label>Fotoalbum verknüpfen
                <select name="albumId" defaultValue="">
                  <option value="">Kein Album</option>
                  {albums.map((album)=><option key={album.id} value={album.id}>{album.title}</option>)}
                </select>
              </label>
              <label>Notiz<textarea name="notes" rows={4} placeholder="Besonderheiten, Finalverlauf, Rekorde …" /></label>
              <button className="primary-button">Titel speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
