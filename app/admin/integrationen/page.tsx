import { getDb } from "@/lib/db";
import { setIntegrationEnabledAction } from "@/app/admin/integrationen/actions";

export const dynamic = "force-dynamic";

const envNames: Record<string,string> = {
  vdc_tc: "VDC_TC_SYNC_TOKEN",
  vdc_turnier: "VDC_TURNIER_SYNC_TOKEN",
  vdc_training: "VDC_TRAINING_SYNC_TOKEN",
};

const descriptions: Record<string,string> = {
  vdc_tc: "Mannschaften, Vereinsspieler und Ligaspieltage aus der Team-Captain-App.",
  vdc_turnier: "Interne Turniere, Teilnehmer und Ergebnisse aus VDC‑Turnier.",
  vdc_training: "Trainingsdaten, Einheiten und Anwesenheit aus VDC‑Training.",
};

const statusLabels: Record<string,string> = {
  connected: "Verbunden",
  disconnected: "Nicht verbunden",
  error: "Fehler",
  disabled: "Deaktiviert",
};

function formatDateTime(value: unknown) {
  if (!value) return "Noch nie";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Noch nie";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const sql = getDb();
  const params = await searchParams;

  const [connections, recentRuns, roleRows, seasonRows] = sql
    ? await Promise.all([
        sql`
          SELECT
            i.integration_key,
            i.display_name,
            i.status,
            i.config,
            i.last_sync_at,
            i.last_error,
            i.updated_at,
            (SELECT count(*)::int FROM integration_entity_links l
             WHERE l.integration_key=i.integration_key) AS linked_entities,
            (SELECT count(*)::int FROM integration_entity_links l
             WHERE l.integration_key=i.integration_key AND l.entity_type='team') AS teams,
            (SELECT count(*)::int FROM integration_entity_links l
             WHERE l.integration_key=i.integration_key AND l.entity_type='player') AS players,
            (SELECT count(*)::int FROM integration_entity_links l
             WHERE l.integration_key=i.integration_key AND l.entity_type='match') AS matches,
            (SELECT count(*)::int FROM integration_entity_links l
             WHERE l.integration_key=i.integration_key AND l.entity_type='tournament') AS tournaments,
            (SELECT count(*)::int FROM integration_entity_links l
             WHERE l.integration_key=i.integration_key AND l.entity_type='training_day') AS training_days
          FROM integration_connections i
          ORDER BY
            CASE i.integration_key
              WHEN 'vdc_tc' THEN 0
              WHEN 'vdc_turnier' THEN 1
              ELSE 2
            END
        `,
        sql`
          SELECT
            integration_key,status,summary,error_text,finished_at
          FROM integration_sync_runs
          ORDER BY finished_at DESC
          LIMIT 10
        `,
        sql`SELECT count(*)::int AS count FROM roles`,
        sql`
          SELECT season
          FROM teams
          WHERE status='active' AND season IS NOT NULL
          GROUP BY season
          ORDER BY count(*) DESC, season DESC
          LIMIT 1
        `,
      ])
    : [[], [], [{ count:0 }], []];

  const connected = connections.filter((c) => c.status === "connected").length;
  const activeSeason = seasonRows[0]?.season ? String(seasonRows[0].season) : "–";

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Integrationen</h1>
          <p>Technische Verbindungen zu VDC‑TC, Turnier und Training überwachen. Diese Informationen sind ausschließlich für Administratoren sichtbar.</p>
        </div>
      </section>

      {params.error && <div className="form-error">Die Systemeinstellung konnte nicht geändert werden.</div>}
      {params.updated && <div className="form-success">Integration wurde aktualisiert.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Integrationen</span><strong>{connected}/{connections.length}</strong><small>verbunden</small></article>
        <article className="stat-card"><span>Rollen</span><strong>{Number(roleRows[0]?.count ?? 0)}</strong><small>Rechtesystem</small></article>
        <article className="stat-card"><span>Saison</span><strong>{activeSeason}</strong><small>aktive Teams</small></article>
        <article className="stat-card"><span>System</span><strong>Club</strong><small>zentrale Datenbasis</small></article>
      </section>

      <section className="integration-grid">
        {connections.map((connection) => {
          const key = String(connection.integration_key);
          const envName = envNames[key];
          const tokenConfigured =
            key === "vdc_tc" ? Boolean(process.env.VDC_TC_SYNC_TOKEN) :
            key === "vdc_turnier" ? Boolean(process.env.VDC_TURNIER_SYNC_TOKEN) :
            key === "vdc_training" ? Boolean(process.env.VDC_TRAINING_SYNC_TOKEN) :
            false;

          return (
            <article className="integration-card" key={key}>
              <div className="integration-card-head">
                <div className="integration-logo">{key === "vdc_tc" ? "TC" : key === "vdc_turnier" ? "TU" : "TR"}</div>
                <div>
                  <span className="eyebrow">Integration</span>
                  <h2>{String(connection.display_name)}</h2>
                </div>
                <span className={`integration-status integration-${connection.status}`}>
                  {statusLabels[String(connection.status)] ?? String(connection.status)}
                </span>
              </div>

              <p>{descriptions[key] ?? "VDC-Systemintegration"}</p>

              <div className="integration-metrics">
                <div><span>Verknüpft</span><strong>{Number(connection.linked_entities ?? 0)}</strong></div>
                <div>
                  <span>{key === "vdc_tc" ? "Teams" : key === "vdc_turnier" ? "Turniere" : "Trainings"}</span>
                  <strong>
                    {key === "vdc_tc"
                      ? Number(connection.teams ?? 0)
                      : key === "vdc_turnier"
                        ? Number(connection.tournaments ?? 0)
                        : Number(connection.training_days ?? 0)}
                  </strong>
                </div>
                <div><span>Mitglieder</span><strong>{Number(connection.players ?? 0)}</strong></div>
                <div>
                  <span>{key === "vdc_tc" ? "Spiele" : "Aktivitäten"}</span>
                  <strong>
                    {key === "vdc_tc"
                      ? Number(connection.matches ?? 0)
                      : key === "vdc_turnier"
                        ? Number(connection.tournaments ?? 0)
                        : Number(connection.training_days ?? 0)}
                  </strong>
                </div>
              </div>

              <div className="integration-meta">
                <div><span>Letzter Sync</span><strong>{formatDateTime(connection.last_sync_at)}</strong></div>
                <div><span>API-Token</span><strong>{tokenConfigured ? "Konfiguriert" : "Noch nicht gesetzt"}</strong></div>
                <div><span>Environment</span><code>{envName ?? "–"}</code></div>
              </div>

              {connection.last_error && <div className="integration-error">{String(connection.last_error)}</div>}

              <form action={setIntegrationEnabledAction}>
                <input type="hidden" name="key" value={key} />
                <input type="hidden" name="enabled" value={connection.status === "disabled" ? "true" : "false"} />
                <button className="ghost-button" type="submit">
                  {connection.status === "disabled" ? "Integration aktivieren" : "Integration deaktivieren"}
                </button>
              </form>
            </article>
          );
        })}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Sync</span><h2>Letzte Synchronisationen</h2></div></div>
          <div className="sync-run-list">
            {recentRuns.length === 0 ? (
              <div className="empty-state">Noch keine Synchronisationen protokolliert.</div>
            ) : recentRuns.map((run, index) => (
              <div className="sync-run-row" key={`${run.integration_key}-${run.finished_at}-${index}`}>
                <span className={`sync-run-dot sync-run-${run.status}`} />
                <div>
                  <strong>{String(run.integration_key).replace("vdc_","VDC ").toUpperCase()}</strong>
                  <span>{formatDateTime(run.finished_at)}</span>
                </div>
                <b>{String(run.status)}</b>
                <small>{run.error_text ? String(run.error_text) : JSON.stringify(run.summary ?? {})}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Architektur</span><h2>Sync-Prinzip</h2></div></div>
          <div className="architecture-flow">
            <div><strong>VDC‑TC</strong><span>Sport & Liga</span></div>
            <b>→</b>
            <div className="architecture-core"><strong>VDC‑Club</strong><span>zentrale Vereinsdaten</span></div>
            <b>←</b>
            <div><strong>Turnier / Training</strong><span>Fachmodule</span></div>
          </div>
          <p>Die Fach-Apps bleiben eigenständig. VDC‑Club hält die stabilen Mitglieder- und Mannschaftsbezüge und übernimmt nur die Daten, die für den Gesamtverein benötigt werden.</p>
          <div className="api-endpoint-list">
            <div className="api-note"><span>TC Push</span><code>POST /api/integrations/vdc-tc/sync</code></div>
            <div className="api-note"><span>Turnier Push</span><code>POST /api/integrations/vdc-turnier/sync</code></div>
            <div className="api-note"><span>Training Push</span><code>POST /api/integrations/vdc-training/sync</code></div>
          </div>
        </article>
      </section>
    </div>
  );
}
