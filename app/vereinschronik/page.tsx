import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { ChronicleNav } from "@/components/chronicle-nav";

export const dynamic="force-dynamic";

function formatDate(value:unknown) {
  if (!value) return "";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("de-DE").format(d);
}

export default async function ClubChroniclePage() {
  await requirePermission("chronicle.read");
  const sql=getDb();

  const [honors,achievements,albums]=sql ? await Promise.all([
    sql`
      SELECT id::text,year,event_date,winner_name,honor_type,custom_title,notes
      FROM club_honors
      ORDER BY COALESCE(event_date,make_date(year,1,1)) DESC
      LIMIT 80
    `,
    sql`
      SELECT id::text,achieved_on,category,title,description
      FROM club_achievements
      ORDER BY achieved_on DESC
      LIMIT 80
    `,
    sql`
      SELECT
        a.id::text,a.title,a.event_date,a.description,
        count(p.id)::int AS photos
      FROM club_photo_albums a
      LEFT JOIN club_photos p ON p.album_id=a.id
      GROUP BY a.id
      ORDER BY COALESCE(a.event_date,a.created_at::date) DESC
      LIMIT 80
    `,
  ]) : [[],[],[]];

  const timeline=[
    ...honors.map((row)=>({
      key:"honor-"+String(row.id),
      date:row.event_date ? new Date(String(row.event_date)) : new Date(Number(row.year),0,1),
      type:"Titel",
      title:row.honor_type==="club_champion"
        ? "Vereinsmeister "+String(row.year)
        : row.honor_type==="christmas_champion"
          ? "Weihnachtsmeister "+String(row.year)
          : String(row.custom_title || "Titel")+" "+String(row.year),
      detail:String(row.winner_name),
      description:String(row.notes ?? ""),
      href:"/vereinschronik/hall-of-fame",
    })),
    ...achievements.map((row)=>({
      key:"achievement-"+String(row.id),
      date:new Date(String(row.achieved_on)),
      type:String(row.category),
      title:String(row.title),
      detail:"",
      description:String(row.description ?? ""),
      href:"/vereinschronik/erfolge",
    })),
    ...albums.map((row)=>({
      key:"album-"+String(row.id),
      date:row.event_date ? new Date(String(row.event_date)) : new Date(0),
      type:"Galerie",
      title:String(row.title),
      detail:Number(row.photos)+" Fotos",
      description:String(row.description ?? ""),
      href:"/vereinschronik/galerie",
    })),
  ].sort((a,b)=>b.date.getTime()-a.date.getTime());

  const years=[...new Set(timeline.map((entry)=>entry.date.getFullYear()).filter((year)=>year>1900))];

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Verein</span>
          <h1>Vereinschronik</h1>
          <p>Die Geschichte des VDC mit Titeln, Erfolgen und besonderen Momenten.</p>
        </div>
      </section>

      <ChronicleNav active="chronicle" />

      <section className="stat-grid">
        <article className="stat-card"><span>Titel</span><strong>{honors.length}</strong><small>Hall of Fame</small></article>
        <article className="stat-card"><span>Erfolge</span><strong>{achievements.length}</strong><small>dokumentiert</small></article>
        <article className="stat-card"><span>Fotoalben</span><strong>{albums.length}</strong><small>Galerien</small></article>
        <article className="stat-card"><span>Jahre</span><strong>{years.length}</strong><small>in der Chronik</small></article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Zeitstrahl</span><h2>Vereinsgeschichte</h2></div>
        </div>

        {timeline.length===0 ? (
          <div className="empty-state">Noch keine Chronik-Einträge vorhanden.</div>
        ) : (
          <div className="chronicle-timeline">
            {timeline.map((entry)=>(
              <Link href={entry.href} className="chronicle-entry" key={entry.key}>
                <div className="chronicle-date">
                  <strong>{entry.date.getFullYear()>1900 ? entry.date.getFullYear() : "–"}</strong>
                  <span>{entry.date.getFullYear()>1900 ? formatDate(entry.date) : ""}</span>
                </div>
                <div className="chronicle-dot" />
                <div className="chronicle-content">
                  <span>{entry.type}</span>
                  <h3>{entry.title}</h3>
                  {entry.detail && <strong>{entry.detail}</strong>}
                  {entry.description && <p>{entry.description}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
