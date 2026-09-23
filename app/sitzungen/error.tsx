"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function MeetingsError({
  error,
  reset,
}:{
  error:Error & { digest?:string };
  reset:()=>void;
}) {
  useEffect(()=>{
    console.error("Sitzungsmodul:",error);
  },[error]);

  return (
    <main className="page-stack meeting-route-state">
      <section className="panel meeting-route-state-card">
        <span className="eyebrow">Sitzungssystem</span>
        <h1>Diese Ansicht konnte nicht geladen werden</h1>
        <p>
          Die Sitzung selbst bleibt gespeichert. Lade die Ansicht erneut oder gehe zurück zur Sitzungsübersicht.
        </p>
        {error.digest && <small>Fehlerkennung: {error.digest}</small>}
        <div className="meeting-route-state-actions">
          <button type="button" className="primary-button" onClick={()=>reset()}>
            Erneut versuchen
          </button>
          <Link href="/sitzungen" className="ghost-button">
            Zur Sitzungsübersicht
          </Link>
        </div>
      </section>
    </main>
  );
}
