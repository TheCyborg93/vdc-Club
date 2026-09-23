export default function MeetingsLoading() {
  return (
    <main className="page-stack meeting-route-state" aria-busy="true" aria-live="polite">
      <section className="panel meeting-route-state-card">
        <span className="eyebrow">Sitzungssystem</span>
        <h1>Sitzung wird geladen</h1>
        <p>Teilnehmer, Tagesordnung, Beschlüsse und Protokolldaten werden vorbereitet.</p>
        <div className="meeting-route-loading-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>
    </main>
  );
}
