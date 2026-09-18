import { getDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Ohne Frist";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatEventDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "--", month: "---", time: "" };
  const day = new Intl.DateTimeFormat("de-DE", { day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("de-DE", { month: "short" }).format(date).replace(".", "").toUpperCase();
  const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
  return { day, month, time };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const now = new Date();
  const today = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);

  const stats = [
    { label: "Mitglieder", value: String(data.members), note: "aktive Mitglieder" },
    { label: "Mannschaften", value: String(data.teams), note: "aktive Teams" },
    { label: "Offene Aufgaben", value: String(data.openTasks), note: "noch zu erledigen" },
    { label: "Nächste Termine", value: String(data.upcomingEvents), note: "in den nächsten 14 Tagen" },
  ];

  return (
    <div className="page-stack">
      <section className="hero">
        <div>
          <span className="eyebrow">{today}</span>
          <h1>Vereinszentrale</h1>
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
            {data.tasks.length === 0 ? (
              <div className="empty-state">Noch keine offenen Aufgaben vorhanden.</div>
            ) : data.tasks.map((task) => (
              <div className="table-row" key={task.title}>
                <div><strong>{task.title}</strong><span>{task.category}</span></div>
                <span>{formatDate(task.dueDate)}</span>
                <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Kalender</span><h2>Nächste Termine</h2></div></div>
          <div className="timeline">
            {data.events.length === 0 ? (
              <div className="empty-state">Noch keine kommenden Termine vorhanden.</div>
            ) : data.events.map((event) => {
              const d = formatEventDate(event.startsAt);
              return (
                <div key={event.title + event.startsAt}>
                  <span>{d.day} {d.month}</span>
                  <p><strong>{event.title}</strong><small>{event.location ?? "Ort offen"} · {d.time}</small></p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Verein</span><h2>Datenbasis</h2></div></div>
          <div className="team-card"><div><strong>{data.members} Mitglieder</strong><span>zentral verwaltet</span></div><b>LIVE</b></div>
          <div className="team-card"><div><strong>{data.teams} Mannschaften</strong><span>bereit für VDC-TC-Sync</span></div><b>LIVE</b></div>
        </article>

        <article className="panel panel-accent">
          <span className="eyebrow">Sitzungsmodus</span>
          <h2>Vorstandssitzung vorbereiten</h2>
          <p>Tagesordnung, Beschlüsse und Aufgaben werden direkt miteinander verknüpft.</p>
          <button className="light-button">Sitzung anlegen</button>
        </article>
      </section>
    </div>
  );
}
