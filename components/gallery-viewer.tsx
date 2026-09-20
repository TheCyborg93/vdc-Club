"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

export type GalleryPhoto = {
  id:string;
  title:string;
  caption:string;
  originalFilename:string;
  isCover:boolean;
};

export function GalleryViewer({
  photos,
  albumTitle,
}:{
  photos:GalleryPhoto[];
  albumTitle:string;
}) {
  const [selected,setSelected]=useState<number|null>(null);

  const current=selected==null ? null : photos[selected] ?? null;
  const canNavigate=photos.length>1;

  function previous() {
    if (selected==null) return;
    setSelected((selected-1+photos.length)%photos.length);
  }

  function next() {
    if (selected==null) return;
    setSelected((selected+1)%photos.length);
  }

  useEffect(()=>{
    if (selected==null) return;

    function onKey(event:KeyboardEvent) {
      if (event.key==="Escape") setSelected(null);
      if (event.key==="ArrowLeft") previous();
      if (event.key==="ArrowRight") next();
    }

    window.addEventListener("keydown",onKey);
    document.body.classList.add("gallery-modal-open");
    return ()=>{
      window.removeEventListener("keydown",onKey);
      document.body.classList.remove("gallery-modal-open");
    };
  },[selected]);

  const selectedLabel=useMemo(()=>{
    if (selected==null) return "";
    return `${selected+1} / ${photos.length}`;
  },[selected,photos.length]);

  return (
    <>
      <div className="gallery-view-grid">
        {photos.map((photo,index)=>(
          <button
            type="button"
            className={photo.isCover ? "gallery-view-card cover" : "gallery-view-card"}
            key={photo.id}
            onClick={()=>setSelected(index)}
          >
            <span className="gallery-view-image">
              <Image
                src={`/api/club-photos/${photo.id}/file`}
                alt={photo.title || photo.caption || albumTitle}
                fill
                sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
                unoptimized
              />
              {photo.isCover && <b>Titelbild</b>}
            </span>
            <span className="gallery-view-copy">
              <strong>{photo.title || photo.originalFilename}</strong>
              {photo.caption && <small>{photo.caption}</small>}
            </span>
          </button>
        ))}
      </div>

      {current && selected!=null && (
        <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={current.title || albumTitle}>
          <button type="button" className="gallery-lightbox-backdrop" onClick={()=>setSelected(null)} aria-label="Galerie schließen" />
          <section className="gallery-lightbox-card">
            <header>
              <div>
                <span>{albumTitle}</span>
                <strong>{current.title || current.originalFilename}</strong>
              </div>
              <div className="gallery-lightbox-actions">
                <span>{selectedLabel}</span>
                <a href={`/api/club-photos/${current.id}/file?download=1`}>Download</a>
                <button type="button" onClick={()=>setSelected(null)}>×</button>
              </div>
            </header>

            <div className="gallery-lightbox-image">
              <Image
                src={`/api/club-photos/${current.id}/file`}
                alt={current.title || current.caption || albumTitle}
                fill
                sizes="100vw"
                unoptimized
                priority
              />
            </div>

            <footer>
              {current.caption ? <p>{current.caption}</p> : <span>Keine Bildbeschreibung.</span>}
              {canNavigate && (
                <div>
                  <button type="button" onClick={previous}>← Vorheriges</button>
                  <button type="button" onClick={next}>Nächstes →</button>
                </div>
              )}
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
