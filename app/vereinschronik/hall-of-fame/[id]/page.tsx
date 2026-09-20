import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { ChronicleNav } from "@/components/chronicle-nav";
import { deleteHonorAction, updateHonorAction } from "@/app/vereinschronik/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic="force-dynamic";

const typeLabels:Record<string,string>={
  club_champion:"Vereinsmeister",
  christmas_champion:"Weihnachtsmeister",
  other:"Weiterer Titel",
};

const formatDate=(value:unknown)=>{
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
};
const dateValue=(value:unknown)=>{
  if (!value) return "";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10);
};

export default async function HallDetailPage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{updated?:string;error?:string}>;
}) {
  const user=await requirePermission("chronicle.read");
  const sql=getDb();
  if (!sql) notFound();
  const {id}=await params;
  const query=await searchParams;
  const canWrite=hasPermission(user.roles,"chronicle.write");

  const [rows,albums]=await Promise.all([
    sql`
      SELECT
        h.*,
        a.title AS album_title,
        (
          SELECT p.id::text
          FROM club_photos p
          WHERE p.album_id=h.album_id
          ORDER BY p.is_cover DESC,p.created_at
          LIMIT 1
        ) AS cover_photo_id
      FROM club_honors h
      LEFT JOIN club_photo_albums a ON a.id=h.album_id
      WHERE h.id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT id::text,title
      FROM club_photo_albums
      ORDER BY COALESCE(event_date,created_at::date) DESC,title
    `,
  ]);

  const honor=rows[0];
  if (!honor) notFound();

  const label=honor.honor_type==="other"
    ? String(honor.custom_title || "Weiterer Titel")
    : typeLabels[String(honor.honor_type)] ?? String(honor.honor_type);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <Link href="/vereinschronik/hall-of-fame" className="back-link">← Hall of Fame</Link>
          <span className="eyebrow">{label} · {String(honor.year)}</span>
          <h1>{String(honor.winner_name)}</h1>
          <p>Alle Details zu diesem Titelgewinn.</p>
        </div>
      </section>

      <ChronicleNav active="hall" />

      {query.updated && <div className="form-success">Hall-of-Fame-Eintrag wurde aktualisiert.</div>}
      {query.error && <div className="form-error">Der Eintrag konnte nicht aktualisiert werden.</div>}

      {honor.cover_photo_id && (
        <article className="hall-hero-photo">
          <Image
            src={`/api/club-photos/${String(honor.cover_photo_id)}/file`}
            alt={String(honor.album_title || label)}
            fill
            sizes="100vw"
            unoptimized
          />
          <div>
            <span>{label} {String(honor.year)}</span>
            <strong>{String(honor.winner_name)}</strong>
          </div>
        </article>
      )}

      <section className="hall-detail-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Ergebnis</span><h2>Turnierdetails</h2></div>
          </div>
          <div className="hall-detail-stats">
            <div><span>Datum</span><strong>{formatDate(honor.event_date)}</strong></div>
            <div><span>Spielort</span><strong>{String(honor.venue || "–")}</strong></div>
            <div><span>Format</span><strong>{String(honor.tournament_format || "–")}</strong></div>
            <div><span>Teilnehmer</span><strong>{honor.participants==null ? "–" : String(honor.participants)}</strong></div>
            <div><span>Finale</span><strong>{String(honor.final_score || "–")}</strong></div>
            <div><span>Average</span><strong>{honor.average==null ? "–" : Number(honor.average).toFixed(2)}</strong></div>
            <div><span>High Finish</span><strong>{honor.high_finish==null ? "–" : String(honor.high_finish)}</strong></div>
            <div><span>Shortleg</span><strong>{honor.short_leg==null ? "–" : String(honor.short_leg)}</strong></div>
          </div>

          <div className="hall-podium">
            <div className="first"><span>1. Platz</span><strong>{String(honor.winner_name)}</strong></div>
            <div><span>2. Platz</span><strong>{String(honor.runner_up_name || "–")}</strong></div>
            <div><span>3. Platz</span><strong>{String(honor.third_place_name || "–")}</strong></div>
          </div>

          {honor.notes && <p className="hall-detail-notes">{String(honor.notes)}</p>}

          {honor.album_id && (
            <Link href={`/vereinschronik/galerie/${String(honor.album_id)}`} className="primary-button hall-album-link">
              Verknüpftes Fotoalbum öffnen
            </Link>
          )}
        </article>

        {canWrite && (
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Bearbeiten</span><h2>Titeldetails pflegen</h2></div>
            </div>
            <form action={updateHonorAction} className="form-stack">
              <input type="hidden" name="id" value={id} />
              <label>Eigene Titelbezeichnung
                <input name="customTitle" defaultValue={String(honor.custom_title ?? "")} />
              </label>
              <label>Sieger / Titelträger
                <input name="winnerName" defaultValue={String(honor.winner_name)} required />
              </label>
              <div className="form-grid">
                <label>2. Platz<input name="runnerUpName" defaultValue={String(honor.runner_up_name ?? "")} /></label>
                <label>3. Platz<input name="thirdPlaceName" defaultValue={String(honor.third_place_name ?? "")} /></label>
              </div>
              <div className="form-grid">
                <label>Datum<input name="eventDate" type="date" defaultValue={dateValue(honor.event_date)} /></label>
                <label>Teilnehmer<input name="participants" type="number" min="0" defaultValue={honor.participants==null ? "" : Number(honor.participants)} /></label>
              </div>
              <div className="form-grid">
                <label>Format<input name="tournamentFormat" defaultValue={String(honor.tournament_format ?? "")} /></label>
                <label>Spielort<input name="venue" defaultValue={String(honor.venue ?? "")} /></label>
              </div>
              <div className="form-grid">
                <label>Finalergebnis<input name="finalScore" defaultValue={String(honor.final_score ?? "")} /></label>
                <label>Average<input name="average" inputMode="decimal" defaultValue={honor.average==null ? "" : String(honor.average)} /></label>
              </div>
              <div className="form-grid">
                <label>High Finish<input name="highFinish" type="number" min="0" max="170" defaultValue={honor.high_finish==null ? "" : Number(honor.high_finish)} /></label>
                <label>Shortleg<input name="shortLeg" type="number" min="9" max="99" defaultValue={honor.short_leg==null ? "" : Number(honor.short_leg)} /></label>
              </div>
              <label>Fotoalbum
                <select name="albumId" defaultValue={String(honor.album_id ?? "")}>
                  <option value="">Kein Album</option>
                  {albums.map((album)=>(
                    <option key={String(album.id)} value={String(album.id)}>{String(album.title)}</option>
                  ))}
                </select>
              </label>
              <label>Notiz<textarea name="notes" rows={4} defaultValue={String(honor.notes ?? "")} /></label>
              <button className="primary-button">Änderungen speichern</button>
            </form>

            <div className="destructive-inline">
              <form action={deleteHonorAction}>
                <input type="hidden" name="id" value={id} />
                <ConfirmSubmitButton message="Diesen Hall-of-Fame-Eintrag endgültig löschen?">
                  Titel löschen
                </ConfirmSubmitButton>
              </form>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
