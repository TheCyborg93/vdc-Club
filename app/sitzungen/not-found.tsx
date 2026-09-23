import Link from "next/link";

export default function MeetingNotFound() {
  return (
    <main className="page-stack meeting-route-state">
      <section className="panel meeting-route-state-card">
        <span className="eyebrow">Sitzungssystem</span>
        <h1>Sitzung nicht gefunden</h1>
        <p>Die Sitzung existiert nicht mehr oder wurde in den Papierkorb verschoben.</p>
        <Link href="/sitzungen" className="primary-button">
          Zur Sitzungsübersicht
        </Link>
      </section>
    </main>
  );
}
