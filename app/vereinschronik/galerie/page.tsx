import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ChronicleNav } from "@/components/chronicle-nav";
import {
  createAlbumAction,
  uploadPhotoAction,
} from "@/app/vereinschronik/actions";

export const dynamic="force-dynamic";

type AlbumRow = {
  id:string;
  title:string;
  eventDate:unknown;
  description:string;
  photoCount:number;
  coverPhotoId:string;
};

function formatDate(value:unknown) {
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
}

export default async function GalleryPage({
  searchParams,
}:{
  searchParams:Promise<Record<string,string|undefined>>;
}) {
  const user=await requirePermission("chronicle.read");
  const sql=getDb();
  const query=await searchParams;
  const canWrite=hasPermission(user.roles,"chronicle.write");

  let albums:AlbumRow[]=[];

  if (sql) {
    const rows=await sql`
      SELECT
        a.id::text,a.title,a.event_date,a.description,
        count(p.id)::int AS photo_count,
        (
          SELECT cp.id::text
          FROM club_photos cp
          WHERE cp.album_id=a.id
          ORDER BY cp.is_cover DESC,cp.created_at
          LIMIT 1
        ) AS cover_photo_id
      FROM club_photo_albums a
      LEFT JOIN club_photos p ON p.album_id=a.id
      GROUP BY a.id
      ORDER BY COALESCE(a.event_date,a.created_at::date) DESC,a.created_at DESC
    `;

    albums=rows.map((row)=>({
      id:String(row.id),
      title:String(row.title),
      eventDate:row.event_date,
      description:String(row.description ?? ""),
      photoCount:Number(row.photo_count ?? 0),
      coverPhotoId:String(row.cover_photo_id ?? ""),
    }));
  }

  const errorLabels:Record<string,string>={
    database:"Datenbank nicht verfügbar.",
    missing:"Bitte einen Albumtitel angeben.",
    photo_missing:"Bitte Album und mindestens ein Bild auswählen.",
    photo_count:"Bitte maximal 20 Fotos gleichzeitig auswählen.",
    photo_type:"Erlaubt sind JPG, PNG und WebP.",
    photo_size:"Mindestens ein Bild ist zu groß. Maximal 8 MB pro Foto.",
    photo_batch_size:"Die gesamte Auswahl ist zu groß. Maximal 80 MB pro Upload.",
    storage:"Der private Dateispeicher ist noch nicht konfiguriert.",
    album:"Das ausgewählte Album wurde nicht gefunden.",
  };

  const totalPhotos=albums.reduce((sum,album)=>sum+album.photoCount,0);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Vereinschronik</span>
          <h1>Galerie</h1>
          <p>Fotoalben öffnen, Bilder im Vollbild ansehen und besondere Vereinsmomente festhalten.</p>
        </div>
      </section>

      <ChronicleNav active="gallery" />

      {(query.created || query.album_deleted) && (
        <div className="form-success">Galerie wurde aktualisiert.</div>
      )}
      {query.error && <div className="form-error">{errorLabels[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Alben</span><strong>{albums.length}</strong><small>Fotoalben</small></article>
        <article className="stat-card"><span>Fotos</span><strong>{totalPhotos}</strong><small>gespeicherte Bilder</small></article>
        <article className="stat-card"><span>Neueste Galerie</span><strong>{albums[0]?.title ?? "–"}</strong><small>{albums[0]?.eventDate ? formatDate(albums[0].eventDate) : "noch kein Album"}</small></article>
        <article className="stat-card"><span>Speicher</span><strong>Privat</strong><small>nur für berechtigte Nutzer</small></article>
      </section>

      {albums.length===0 ? (
        <article className="panel"><div className="empty-state">Noch keine Fotoalben vorhanden.</div></article>
      ) : (
        <section className="gallery-album-grid">
          {albums.map((album)=>(
            <Link href={`/vereinschronik/galerie/${album.id}`} className="gallery-album-card" key={album.id}>
              <div className="gallery-album-cover">
                {album.coverPhotoId ? (
                  <Image
                    src={`/api/club-photos/${album.coverPhotoId}/file`}
                    alt={album.title}
                    fill
                    sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
                    unoptimized
                  />
                ) : (
                  <div className="gallery-album-empty">Noch kein Titelbild</div>
                )}
                <span>{album.photoCount} Fotos</span>
              </div>
              <div className="gallery-album-copy">
                <small>{album.eventDate ? formatDate(album.eventDate) : "Fotoalbum"}</small>
                <strong>{album.title}</strong>
                {album.description && <p>{album.description}</p>}
                <b>Album öffnen →</b>
              </div>
            </Link>
          ))}
        </section>
      )}

      {canWrite && (
        <section className="chronicle-gallery-create">
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Album</span><h2>Neues Fotoalbum</h2></div>
            </div>
            <form action={createAlbumAction} className="form-stack">
              <label>Albumtitel<input name="title" required placeholder="z. B. Vereinsmeisterschaft 2026" /></label>
              <label>Datum<input name="eventDate" type="date" /></label>
              <label>Beschreibung<textarea name="description" rows={3} /></label>
              <button className="primary-button">Album anlegen</button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Schnellupload</span><h2>Fotos hinzufügen</h2></div>
            </div>
            <form action={uploadPhotoAction} className="form-stack" encType="multipart/form-data">
              <label>Album
                <select name="albumId" defaultValue="" required>
                  <option value="" disabled>Album auswählen</option>
                  {albums.map((album)=><option key={album.id} value={album.id}>{album.title}</option>)}
                </select>
              </label>
              <label>Fotos
                <input
                  name="files"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  multiple
                  required
                />
              </label>
              <small>Mehrfachauswahl möglich · maximal 20 Fotos · JPG, PNG oder WebP · maximal 8 MB je Foto und 80 MB pro Upload. Danach öffnet sich das Album.</small>
              <label>Titel<input name="title" placeholder="Optional · nur bei einem einzelnen Foto" /></label>
              <label>Gemeinsame Bildbeschreibung<textarea name="caption" rows={3} placeholder="Optional · wird auf alle ausgewählten Fotos angewendet" /></label>
              <button className="primary-button" disabled={albums.length===0}>Fotos hochladen</button>
            </form>
          </article>
        </section>
      )}
    </div>
  );
}
