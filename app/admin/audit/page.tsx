import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const actionLabels: Record<string,string> = {
  "integration.enabled":"Integration aktiviert",
  "integration.disabled":"Integration deaktiviert",
  "user.status_changed":"Benutzerstatus geändert",
  "user.roles_changed":"Benutzerrollen geändert",
  "user.unlocked":"Login entsperrt",
  "user.sessions_revoked":"Sessions widerrufen",
  "member.account_created":"Benutzerzugang erstellt",
  "member.roles_changed":"Rollen am Mitglied geändert",
  "training.attendance_saved":"Trainingsanwesenheit gespeichert",
  "training.cancelled":"Training abgesagt",
  "training.restored":"Training wieder aktiviert",
  "training.special_created":"Sondertraining angelegt",
  "training.pause_created":"Trainingspause angelegt",
  "training.pause_deleted":"Trainingspause aufgehoben",
  "training.season_created":"Trainingssaison angelegt",
  "training.season_updated":"Trainingssaison geändert",
  "training.season_activated":"Trainingssaison aktiviert",
  "document.created":"Dokument registriert",
  "document.metadata_updated":"Dokumentdaten geändert",
  "document.version_replaced":"Neue Dokumentversion hinterlegt",
  "document.status_changed":"Dokumentstatus geändert",
  "document.archived":"Dokument archiviert",
  "document.restored":"Dokument wiederhergestellt",
  "meeting.status_changed":"Sitzungsstatus geändert",
  "meeting.updated":"Sitzungsdaten geändert",
  "meeting.attendance_changed":"Sitzungsanwesenheit geändert",
  "agenda.status_changed":"TOP-Status geändert",
  "agenda.notes_updated":"TOP-Ergebnisnotiz geändert",
  "resolution.created":"Beschluss angelegt",
  "task.status_changed":"Aufgabenstatus geändert",
  "resolution.status_changed":"Beschlussstatus geändert",
  "resolution.implementation_updated":"Umsetzungsnotiz geändert",
  "resolution.task_created":"Folgeaufgabe zu Beschluss angelegt",
  "trash.moved":"In Papierkorb verschoben",
  "trash.restored":"Aus Papierkorb wiederhergestellt",
  "trash.permanently_deleted":"Endgültig gelöscht",
  "trash.storage_cleanup_failed":"Storage-Bereinigung fehlgeschlagen",
  "agenda.deleted":"TOP gelöscht",
  "training.attendance_reset":"Trainingsanwesenheit zurückgesetzt",
  "member.deleted_unused":"Unbenutztes Mitglied endgültig gelöscht",
};

function formatDateTime(value: unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",second:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

function metadataText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const entries=Object.entries(value as Record<string,unknown>);
  if (!entries.length) return "";
  return entries
    .slice(0,6)
    .map(([key,val])=>{
      const rendered=Array.isArray(val) ? val.join(", ") : String(val ?? "");
      return `${key}: ${rendered}`;
    })
    .join(" · ");
}

export default async function AdminAuditPage() {
  const sql=getDb();

  const [logs,stats]=sql
    ? await Promise.all([
        sql`
          SELECT
            a.id,
            a.action,
            a.entity_type,
            a.entity_id,
            a.metadata,
            a.created_at,
            u.display_name AS actor_name,
            u.email AS actor_email
          FROM audit_log a
          LEFT JOIN app_users u ON u.id=a.actor_user_id
          ORDER BY a.created_at DESC
          LIMIT 150
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE created_at>=CURRENT_DATE)::int AS today,
            count(*) FILTER (WHERE created_at>=now()-interval '7 days')::int AS week,
            count(DISTINCT actor_user_id) FILTER (WHERE created_at>=now()-interval '30 days')::int AS actors,
            count(*)::int AS total
          FROM audit_log
        `,
      ])
    : [[],[{today:0,week:0,actors:0,total:0}]];

  const s=stats[0] ?? {};

  return (
    <div className="page-stack">
      <section className="page-heading admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Audit-Log</h1>
          <p>Nachvollziehbarkeit administrativer und sicherheitsrelevanter Änderungen.</p>
        </div>
        <span className="admin-lock-chip">ADMIN</span>
      </section>

      <section className="stat-grid">
        <article className="stat-card"><span>Heute</span><strong>{Number(s.today ?? 0)}</strong><small>Aktionen</small></article>
        <article className="stat-card"><span>7 Tage</span><strong>{Number(s.week ?? 0)}</strong><small>Aktionen</small></article>
        <article className="stat-card"><span>Admins aktiv</span><strong>{Number(s.actors ?? 0)}</strong><small>30 Tage</small></article>
        <article className="stat-card"><span>Gesamt</span><strong>{Number(s.total ?? 0)}</strong><small>Audit-Einträge</small></article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Chronik</span><h2>Letzte administrative Aktionen</h2></div>
          <span className="count-chip">{logs.length}</span>
        </div>

        <div className="audit-list">
          {logs.length===0 ? (
            <div className="empty-state">Noch keine administrativen Aktionen protokolliert.</div>
          ) : logs.map((log)=>(
            <div className="audit-row" key={String(log.id)}>
              <div className="audit-marker" />
              <div className="audit-main">
                <div className="audit-title">
                  <strong>{actionLabels[String(log.action)] ?? String(log.action)}</strong>
                  <span>{String(log.entity_type)}</span>
                </div>
                <span>
                  {log.actor_name ? String(log.actor_name) : "System"}
                  {log.actor_email ? ` · ${log.actor_email}` : ""}
                </span>
                {log.entity_id && <small>Objekt: {String(log.entity_id)}</small>}
                {metadataText(log.metadata) && <p>{metadataText(log.metadata)}</p>}
              </div>
              <time>{formatDateTime(log.created_at)}</time>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
