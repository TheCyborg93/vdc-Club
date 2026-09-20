import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ChronicleNav } from "@/components/chronicle-nav";
import { GalleryViewer, type GalleryPhoto } from "@/components/gallery-viewer";
import {
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

export default async function AlbumPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<Record<string,string|undefined>>;
}) {
  const user=await requirePermission("chronicle.read");
  const sql=getDb();
  if (!sql) notFound();

  const {id}=await params;
  const query=await searchParams;
  const canWrite=hasPermission(user.roles,"chronicle.write");

  const [albumRows,photoRows,honorRows]=await Promise.all([
    sql`
      SELECT id::text,title,event_date,description,created_at
      FROM club_photo_albums
      WHERE id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT id::text,title,caption,original_filename,is_cover,created_at
      FROM club_photos
      WHERE album_id=${id}::uuid
      ORDER BY is_cover DESC,created_at,id
    `,
    sql`
      SELECT id::text,year,honor_type,custom_title,winner_name
      FROM club_honors
      WHERE album_id=${id}::uuid
      ORDER BY year DESC
    `,
  ]);

  const album=albumRows[0];
  if (!album) notFound();

  const photos:GalleryPhoto[]=photoRows.map((row)=>({
    id:String(row.id),
    title:String(row.title ?? ""),
    caption:String(row.caption ?? ""),
    originalFilename:String(row.original_filename),
    isCover:Boolean(row.is_cover),
  }));

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <Link href="/vereinschronik/galerie" className="back-link">← Galerie</Link>
          <span className="eyebrow">{album.event_date ? formatDate(album.event_date) : "Fotoalbum"}</span>
          <h1>{String(album.title)}</h1>
          <p>{String(album.description || "Fotoalbum des Vestischen Dart Club e.V.")}</p>
        </div>
        <div className="gallery-album-count">
          <strong>{photos.length}</strong>
          <span>Fotos</span>
        </div>
      </section>

      <ChronicleNav active="gallery" />

      {(query.uploaded || query.cover || query.photo_deleted) && (
        <div className="form-success">Album wurde aktualisiert.</div>
      )}

      {honorRows.length>0 && (
        <div className="gallery-linked-honors">
          <span>Verknüpft mit:</span>
          {honorRows.map((honor)=>(
            <Link href={`/vereinschronik/hall-of-fame/${String(honor.id)}`} key={String(honor.id)}>
              {honor.honor_type==="club_champion"
                ? `Vereinsmeister ${String(honor.year)}`
                : honor.honor_type==="christmas_champion"
                  ? `Weihnachtsmeister ${String(honor.year)}`
                  : `${String(honor.custom_title || "Titel")} ${String(honor.year)}`}
              {" · "}{String(honor.winner_name)}
            </Link>
          ))}
        </div>
      )}

      <article className="panel gallery-view-panel">
        <div className="panel-head">
          <div><span className="eyebrow">Album</span><h2>Fotos ansehen</h2></div>
          <small>Foto anklicken für Vollbild · Pfeiltasten zum Blättern</small>
        </div>

        {photos.length===0 ? (
          <div className="empty-state">In diesem Album sind noch keine Fotos.</div>
        ) : (
          <GalleryViewer photos={photos} albumTitle={String(album.title)} />
        )}
      </article>

      {canWrite && (
        <section className="chronicle-gallery-manage">
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Album</span><h2>Foto hinzufügen</h2></div>
            </div>
            <form action={uploadPhotoAction} className="form-stack" encType="multipart/form-data">
              <input type="hidden" name="albumId" value={id} />
              <label>Bild
                <input name="file" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" required />
              </label>
              <small>JPG, PNG oder WebP · maximal 8 MB.</small>
              <label>Titel<input name="title" placeholder="Optional" /></label>
              <label>Bildbeschreibung<textarea name="caption" rows={3} placeholder="Optional" /></label>
              <button className="primary-button">Foto hochladen</button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Verwaltung</span><h2>Fotos verwalten</h2></div>
            </div>

            {photos.length===0 ? (
              <div className="empty-state">Noch keine Fotos vorhanden.</div>
            ) : (
              <div className="gallery-admin-list">
                {photos.map((photo)=>(
                  <div key={photo.id}>
                    <div>
                      <strong>{photo.title || photo.originalFilename}</strong>
                      <span>{photo.isCover ? "Titelbild" : "Foto"}</span>
                    </div>
                    <div>
                      {!photo.isCover && (
                        <form action={setAlbumCoverAction}>
                          <input type="hidden" name="photoId" value={photo.id} />
                          <input type="hidden" name="albumId" value={id} />
                          <button className="mini-button">Als Titelbild</button>
                        </form>
                      )}
                      <form action={deletePhotoAction}>
                        <input type="hidden" name="id" value={photo.id} />
                        <ConfirmSubmitButton message="Dieses Foto endgültig löschen?">Löschen</ConfirmSubmitButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}

      {canWrite && (
        <article className="panel destructive-zone">
          <span className="eyebrow">Gefahrenbereich</span>
          <h2>Album löschen</h2>
          <p>Beim Löschen werden alle Fotos dieses Albums endgültig aus dem privaten Speicher entfernt.</p>
          <form action={deleteAlbumAction}>
            <input type="hidden" name="id" value={id} />
            <ConfirmSubmitButton
              message={`Album „${String(album.title)}“ inklusive aller Fotos endgültig löschen?`}
              requireText="LÖSCHEN"
            >
              Album endgültig löschen
            </ConfirmSubmitButton>
          </form>
        </article>
      )}
    </div>
  );
}
