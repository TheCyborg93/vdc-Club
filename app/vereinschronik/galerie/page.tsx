import Image from "next/image";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ChronicleNav } from "@/components/chronicle-nav";
import {
  createAlbumAction,
  deleteAlbumAction,
  deletePhotoAction,
  setAlbumCoverAction,
  uploadPhotoAction,
} from "@/app/vereinschronik/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic="force-dynamic";

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

  const [albums,photos]=sql ? await Promise.all([
    sql`
      SELECT
        a.id::text,a.title,a.event_date,a.description,a.created_at,
        count(p.id)::int AS photo_count
      FROM club_photo_albums a
      LEFT JOIN club_photos p ON p.album_id=a.id
      GROUP BY a.id
      ORDER BY COALESCE(a.event_date,a.created_at::date) DESC,a.created_at DESC
    `,
    sql`
      SELECT
        id::text,album_id::text,title,caption,original_filename,
        file_size_bytes,is_cover,created_at
      FROM club_photos
      ORDER BY is_cover DESC,created_at
    `,
  ]) : [[],[]];

  const photosByAlbum=new Map<string,typeof photos>();
  for (const photo of photos) {
    const albumId=String(photo.album_id);
    if (!photosByAlbum.has(albumId)) photosByAlbum.set(albumId,[]);
    photosByAlbum.get(albumId)!.push(photo);
  }

  const errorLabels:Record<string,string>={
    database:"Datenbank nicht verfügbar.",
    missing:"Bitte einen Albumtitel angeben.",
    photo_missing:"Bitte Album und Bild auswählen.",
    photo_type:"Erlaubt sind JPG, PNG und WebP.",
    photo_size:"Das Bild ist zu groß. Maximal 8 MB.",
    storage:"Der private Dateispeicher ist noch nicht konfiguriert.",
    album:"Das ausgewählte Album wurde nicht gefunden.",
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Vereinschronik</span>
          <h1>Galerie</h1>
          <p>Fotos aus Turnieren, Vereinsabenden, Spieltagen und besonderen Momenten.</p>
        </div>
      </section>

      <ChronicleNav active="gallery" />

      {(query.created || query.uploaded || query.cover || query.photo_deleted || query.album_deleted) && (
        <div className="form-success">Galerie wurde aktualisiert.</div>
      )}
      {query.error && <div className="form-error">{errorLabels[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}

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
              <div><span className="eyebrow">Foto</span><h2>Bild hochladen</h2></div>
            </div>
            <form action={uploadPhotoAction} className="form-stack" encType="multipart/form-data">
              <label>Album
                <select name="albumId" defaultValue="" required>
                  <option value="" disabled>Album auswählen</option>
                  {albums.map((album)=>(
                    <option key={String(album.id)} value={String(album.id)}>{String(album.title)}</option>
                  ))}
                </select>
              </label>
              <label>Bild
                <input name="file" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" required />
              </label>
              <small>JPG, PNG oder WebP · maximal 8 MB.</small>
              <label>Titel<input name="title" placeholder="Optional" /></label>
              <label>Bildbeschreibung<textarea name="caption" rows={3} placeholder="Optional" /></label>
              <button className="primary-button" disabled={albums.length===0}>Foto hochladen</button>
            </form>
          </article>
        </section>
      )}

      {albums.length===0 ? (
        <article className="panel"><div className="empty-state">Noch keine Fotoalben vorhanden.</div></article>
      ) : (
        <div className="album-stack">
          {albums.map((album)=>{
            const albumPhotos=photosByAlbum.get(String(album.id)) ?? [];
            return (
              <article className="panel album-panel" key={String(album.id)}>
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">{album.event_date ? formatDate(album.event_date) : "Galerie"}</span>
                    <h2>{String(album.title)}</h2>
                    {album.description && <p>{String(album.description)}</p>}
                  </div>
                  <div className="album-head-actions">
                    <span className="count-chip">{Number(album.photo_count)} Fotos</span>
                    {canWrite && (
                      <form action={deleteAlbumAction}>
                        <input type="hidden" name="id" value={String(album.id)} />
                        <ConfirmSubmitButton
                          message={"Album „"+String(album.title)+"“ inklusive aller Fotos endgültig löschen?"}
                          requireText="LÖSCHEN"
                        >
                          Album löschen
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </div>

                {albumPhotos.length===0 ? (
                  <div className="empty-state">In diesem Album sind noch keine Fotos.</div>
                ) : (
                  <div className="photo-grid">
                    {albumPhotos.map((photo)=>(
                      <article className={photo.is_cover ? "photo-card cover" : "photo-card"} key={String(photo.id)}>
                        <div className="photo-image">
                          <Image
                            src={"/api/club-photos/"+String(photo.id)+"/file"}
                            alt={String(photo.title || photo.caption || album.title)}
                            fill
                            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
                            unoptimized
                          />
                          {photo.is_cover && <span className="cover-badge">Titelbild</span>}
                        </div>
                        <div className="photo-info">
                          <strong>{String(photo.title || photo.original_filename)}</strong>
                          {photo.caption && <p>{String(photo.caption)}</p>}
                          {canWrite && (
                            <div className="photo-actions">
                              {!photo.is_cover && (
                                <form action={setAlbumCoverAction}>
                                  <input type="hidden" name="photoId" value={String(photo.id)} />
                                  <input type="hidden" name="albumId" value={String(album.id)} />
                                  <button className="mini-button">Als Titelbild</button>
                                </form>
                              )}
                              <form action={deletePhotoAction}>
                                <input type="hidden" name="id" value={String(photo.id)} />
                                <ConfirmSubmitButton message="Dieses Foto endgültig löschen?">Löschen</ConfirmSubmitButton>
                              </form>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
