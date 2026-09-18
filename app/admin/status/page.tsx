import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatDateTime(value: unknown) {
  if (!value) return "Noch nie";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Noch nie";
  return new Intl.DateTimeFormat("de-DE", {
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

export default async function AdminStatusPage() {
  const sql = getDb();

  const [dbInfo, tableCounts, sessions, integrations] = sql
    ? await Promise.all([
        sql`
          SELECT
            current_database() AS database_name,
            current_user AS database_user,
            version() AS version,
            now() AS checked_at
        `,
        sql`
          SELECT
            (SELECT count(*) FROM members)::int AS members,
            (SELECT count(*) FROM app_users)::int AS users,
            (SELECT count(*) FROM club_events)::int AS events,
            (SELECT count(*) FROM audit_log)::int AS audit_entries
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE expires_at>now())::int AS active,
            count(*) FILTER (WHERE expires_at<=now())::int AS expired
          FROM user_sessions
        `,
        sql`
          SELECT integration_key,display_name,status,last_sync_at,last_error
          FROM integration_connections
          ORDER BY integration_key
        `,
      ])
    : [[],[],[],[]];

  const info=dbInfo[0] ?? {};
  const counts=tableCounts[0] ?? {};
  const session= sessions[0] ?? {};
  const databaseConfigured=Boolean(process.env.DATABASE_URL);

  const envRows=[
    {name:"DATABASE_URL",configured:databaseConfigured,description:"Neon PostgreSQL"},
    {name:"VDC_TC_SYNC_TOKEN",configured:Boolean(process.env.VDC_TC_SYNC_TOKEN),description:"VDC-TC Push"},
    {name:"VDC_TURNIER_SYNC_TOKEN",configured:Boolean(process.env.VDC_TURNIER_SYNC_TOKEN),description:"VDC-Turnier Push"},
    {name:"VDC_TRAINING_SYNC_TOKEN",configured:Boolean(process.env.VDC_TRAINING_SYNC_TOKEN),description:"VDC-Training Push"},
  ];

  return (
    <div className="page-stack">
      <section className="page-heading admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Systemstatus</h1>
          <p>Technische Systemgesundheit und Konfiguration. Es werden keine Secret-Werte angezeigt.</p>
        </div>
        <span className="admin-lock-chip">ADMIN</span>
      </section>

      <section className="stat-grid">
        <article className="stat-card"><span>Datenbank</span><strong>{databaseConfigured && dbInfo.length ? "Online" : "Fehlt"}</strong><small>{info.database_name ? String(info.database_name) : "keine Verbindung"}</small></article>
        <article className="stat-card"><span>Sessions</span><strong>{Number(session.active ?? 0)}</strong><small>aktive Anmeldungen</small></article>
        <article className="stat-card"><span>Benutzer</span><strong>{Number(counts.users ?? 0)}</strong><small>Konten gesamt</small></article>
        <article className="stat-card"><span>Audit</span><strong>{Number(counts.audit_entries ?? 0)}</strong><small>protokollierte Aktionen</small></article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Datenbank</span><h2>PostgreSQL</h2></div></div>
          <div className="system-detail-list">
            <div><span>Status</span><strong>{databaseConfigured && dbInfo.length ? "Verbunden" : "Nicht verfügbar"}</strong></div>
            <div><span>Datenbank</span><strong>{info.database_name ? String(info.database_name) : "–"}</strong></div>
            <div><span>Rolle</span><strong>{info.database_user ? String(info.database_user) : "–"}</strong></div>
            <div><span>Prüfung</span><strong>{formatDateTime(info.checked_at)}</strong></div>
            <div className="system-detail-wide"><span>Version</span><code>{info.version ? String(info.version) : "–"}</code></div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Environment</span><h2>Konfiguration</h2></div></div>
          <div className="env-status-list">
            {envRows.map((env)=>(
              <div key={env.name}>
                <span className={`system-dot ${env.configured ? "ok" : "missing"}`} />
                <div><strong>{env.name}</strong><span>{env.description}</span></div>
                <b>{env.configured ? "Gesetzt" : "Fehlt"}</b>
              </div>
            ))}
          </div>
          <p className="form-hint">Secret-Werte werden bewusst niemals in der Oberfläche ausgegeben.</p>
        </article>
      </section>

      <article className="panel">
        <div className="panel-head"><div><span className="eyebrow">Integrationen</span><h2>Technischer Zustand</h2></div></div>
        <div className="system-integration-table">
          {integrations.map((integration)=>(
            <div key={String(integration.integration_key)}>
              <div>
                <strong>{String(integration.display_name)}</strong>
                <span>{String(integration.integration_key)}</span>
              </div>
              <span className={`integration-status integration-${integration.status}`}>{String(integration.status)}</span>
              <div><span>Letzter Sync</span><strong>{formatDateTime(integration.last_sync_at)}</strong></div>
              <div><span>Fehler</span><strong>{integration.last_error ? String(integration.last_error) : "Keiner"}</strong></div>
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-head"><div><span className="eyebrow">Bestand</span><h2>Technische Kennzahlen</h2></div></div>
        <div className="admin-hidden-grid">
          <div><strong>{Number(counts.members ?? 0)}</strong><span>Mitgliedsdatensätze</span></div>
          <div><strong>{Number(counts.events ?? 0)}</strong><span>Kalenderereignisse</span></div>
          <div><strong>{Number(session.expired ?? 0)}</strong><span>abgelaufene Sessions</span></div>
          <div><strong>{process.env.NODE_ENV ?? "unknown"}</strong><span>Node-Umgebung</span></div>
        </div>
      </article>
    </div>
  );
}
