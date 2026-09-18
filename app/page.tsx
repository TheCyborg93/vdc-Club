const stats = [
  { label: "Mitglieder", value: "38", note: "+3 in dieser Saison" },
  { label: "Mannschaften", value: "2", note: "beide aktiv" },
  { label: "Offene Aufgaben", value: "7", note: "2 mit hoher Priorität" },
  { label: "Nächste Termine", value: "4", note: "in den nächsten 14 Tagen" }
];

const tasks = [
  ["Mannschaftsmeldung prüfen", "Sport", "28.09.", "Hoch"],
  ["Angebot neue Boards", "Material", "03.10.", "Mittel"],
  ["Vereinsmeisterschaft planen", "Turnier", "12.10.", "Mittel"]
];

export default function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="hero">
        <div>
          <span className="eyebrow">Freitag · 18. September 2026</span>
          <h1>Guten Morgen, Vorstand.</h1>
          <p>Alles Wichtige aus Verein, Mannschaften, Organisation und Finanzen auf einen Blick.</p>
        </div>
        <div className="hero-badge">
          <span>VDC</span>
          <strong>Club Control</strong>
          <small>Saison 2026/27</small>
        </div>
      </section>

      <section className="stat-grid">
        {stats.map((item) => (
          <article className="stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-head">
            <div><span className="eyebrow">Organisation</span><h2>Offene Aufgaben</h2></div>
            <button className="ghost-button">Alle anzeigen</button>
          </div>
          <div className="table-list">
            {tasks.map(([name, area, date, priority]) => (
              <div className="table-row" key={name}>
                <div><strong>{name}</strong><span>{area}</span></div>
                <span>{date}</span>
                <span className={`priority priority-${priority.toLowerCase()}`}>{priority}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Kalender</span><h2>Nächste Termine</h2></div></div>
          <div className="timeline">
            <div><span>20 SEP</span><p><strong>Ligaspiel 1. Mannschaft</strong><small>Auswärtsspiel · 14:00</small></p></div>
            <div><span>24 SEP</span><p><strong>Training</strong><small>Vereinsheim · 19:00</small></p></div>
            <div><span>02 OKT</span><p><strong>Vorstandssitzung</strong><small>Besprechungsraum · 19:30</small></p></div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Teams</span><h2>Mannschaften</h2></div></div>
          <div className="team-card"><div><strong>1. Mannschaft</strong><span>Münsterland Dartliga · 4A</span></div><b>Aktiv</b></div>
          <div className="team-card"><div><strong>2. Mannschaft</strong><span>Vereinsbetrieb</span></div><b>Aktiv</b></div>
        </article>

        <article className="panel panel-accent">
          <span className="eyebrow">Sitzungsmodus</span>
          <h2>Vorstandssitzung vorbereiten</h2>
          <p>Tagesordnung, Beschlüsse und Aufgaben werden später direkt miteinander verknüpft.</p>
          <button className="light-button">Sitzung anlegen</button>
        </article>
      </section>
    </div>
  );
}
