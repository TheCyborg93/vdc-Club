import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { createEventAction, syncCalendarSourcesAction } from "@/app/kalender/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ensureTrainingSchedule } from "@/lib/training";

const typeLabels: Record<string, string> = {
  club: "Verein",
  league: "Liga",
  training: "Training",
  tournament: "Turnier",
  board: "Vorstand",
};

const errors: Record<string, string> = {
  database: "Die Datenbankverbindung fehlt.",
  missing: "Titel und Startzeit sind erforderlich.",
  protected_delete: "Dieser Termin wird von einem anderen Vereinsbereich verwaltet und kann hier nicht gelöscht werden.",
};

export const dynamic = "force-dynamic";

function formatSyncTime(value: unknown) {
  if (!value) return "Noch nie";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Noch nie";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function formatDateTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string; synced?: string; sync_error?: string }>;
}) {
  const actor = await requirePermission("calendar.read");
  await ensureTrainingSchedule(365);
  const sql = getDb();
  const params = await searchParams;

  const [events, counts, integrations] = sql
    ? await Promise.all([
        sql`
          SELECT
            e.id::text,
            e.title,
            e.event_type,
            e.starts_at,
            e.ends_at,
            e.location,
            e.source,
            e.description,
            m.id::text AS meeting_id,
            ts.id::text AS training_session_id,
            ts.status AS training_status
          FROM club_events e
          LEFT JOIN meetings m ON m.event_id = e.id AND m.deleted_at IS NULL
          LEFT JOIN training_sessions ts ON ts.event_id = e.id AND ts.deleted_at IS NULL
          WHERE e.deleted_at IS NULL
            AND e.starts_at >= now() - interval '1 day'
          ORDER BY e.starts_at ASC
          LIMIT 80
        `,
        sql`
          SELECT
            count(*) FILTER (
              WHERE starts_at >= date_trunc('week', now())
                AND starts_at < date_trunc('week', now()) + interval '7 days'
                AND NOT EXISTS (
                  SELECT 1
                  FROM training_sessions ts
                  WHERE ts.event_id=club_events.id
                    AND ts.status='cancelled'
                )
            )::int AS week,
            count(*) FILTER (WHERE event_type = 'league' AND starts_at >= now())::int AS league,
            count(*) FILTER (
              WHERE event_type = 'training'
                AND starts_at >= now()
                AND NOT EXISTS (
                  SELECT 1
                  FROM training_sessions ts
                  WHERE ts.event_id=club_events.id
                    AND ts.status='cancelled'
                )
            )::int AS training,
            count(*) FILTER (WHERE event_type = 'board' AND starts_at >= now())::int AS board
          FROM club_events
          WHERE deleted_at IS NULL
        `,
        sql`
          SELECT integration_key,display_name,status,last_sync_at,last_error
          FROM integration_connections
          WHERE integration_key IN ('vdc_tc','vdc_turnier','vdc_training')
          ORDER BY CASE integration_key
            WHEN 'vdc_tc' THEN 0
            WHEN 'vdc_turnier' THEN 1
            ELSE 2
          END
        `,
      ])
    : [[], [{ week: 0, league: 0, training: 0, board: 0 }], []];

  const count = counts[0] ?? {};
  const canWrite = hasPermission(actor.roles, "calendar.write");
  const isAdmin = actor.roles.includes("admin");

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Vereinskalender</h1>
          <p>Liga, Training, Turniere, Vorstand und Vereinsveranstaltungen in einer gemeinsamen Ansicht.</p>
        </div>
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(params.created || params.deleted) && <div className="form-success">Kalender wurde aktualisiert.</div>}
      {params.synced && <div className="form-success">TC, Turnier und Training wurden manuell synchronisiert.</div>}
      {params.sync_error && <div className="form-error">Mindestens eine Quelle konnte nicht synchronisiert werden. Details stehen unten beim Sync-Status.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Diese Woche</span><strong>{Number(count.week ?? 0)}</strong><small>Termine</small></article>
        <article className="stat-card"><span>Liga</span><strong>{Number(count.league ?? 0)}</strong><small>kommende Spiele</small></article>
        <article className="stat-card"><span>Training</span><strong>{Number(count.training ?? 0)}</strong><small>kommende Einheiten</small></article>
        <article className="stat-card"><span>Vorstand</span><strong>{Number(count.board ?? 0)}</strong><small>kommende Termine</small></article>
      </section>

      <section className="calendar-sync-panel">
        <div className="calendar-sync-head">
          <div>
            <span className="eyebrow">Automatische Aktualisierung</span>
            <h2>Datenquellen</h2>
            <p>VDC Club prüft beim Öffnen automatisch auf neue Daten und synchronisiert veraltete Quellen.</p>
          </div>
          {canWrite && (
            <form action={syncCalendarSourcesAction}>
              <button className="primary-button" type="submit">Jetzt synchronisieren</button>
            </form>
          )}
        </div>
        <div className="calendar-sync-grid">
          {integrations.map((integration)=>(
            <article className="calendar-sync-card" key={String(integration.integration_key)}>
              <div>
                <strong>{String(integration.display_name)}</strong>
                <span className={"integration-status integration-"+String(integration.status)}>
                  {String(integration.status)==="connected" ? "Aktuell" :
                   String(integration.status)==="error" ? "Fehler" :
                   String(integration.status)==="disabled" ? "Deaktiviert" : "Wartet"}
                </span>
              </div>
              <span>Letzter Sync</span>
              <b>{formatSyncTime(integration.last_sync_at)}</b>
              {integration.last_error && <small>{String(integration.last_error)}</small>}
            </article>
          ))}
        </div>
      </section>

      <section className={canWrite ? "management-grid" : "management-grid single"}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Kommend</span><h2>Termine</h2></div>
            <span className="count-chip">{events.length}</span>
          </div>

          <div className="calendar-list">
            {events.length === 0 ? (
              <div className="empty-state">Noch keine kommenden Termine vorhanden.</div>
            ) : events.map((event) => (
              <div className="calendar-event" key={String(event.id)}>
                <div className={`event-type-dot event-${event.event_type}`} />
                <div className="calendar-event-main">
                  <div className="calendar-event-title">
                    <strong>{String(event.title)}</strong>
                    <span className="role-chip">{typeLabels[String(event.event_type)] ?? String(event.event_type)}</span>
                  </div>
                  <span>{formatDateTime(event.starts_at)}</span>
                  <small>
                    {event.location ? String(event.location) : "Ort offen"}
                    {isAdmin && event.source !== "club" ? ` · Quelle: ${event.source}` : ""}
                  </small>
                  {event.description && <p>{String(event.description)}</p>}
                </div>
                <div className="calendar-event-actions">
                  {event.meeting_id && <a className="mini-button" href={`/sitzungen/${event.meeting_id}`}>Sitzung öffnen</a>}
                  {event.training_session_id && <a className="mini-button" href={`/training/${event.training_session_id}`}>Training öffnen</a>}
                  {canWrite && event.source === "club" && !event.meeting_id && !event.training_session_id && (
                    <form action={moveToTrashAction}>
                      <input type="hidden" name="type" value="event" />
                      <input type="hidden" name="id" value={String(event.id)} />
                      <ConfirmSubmitButton message={"Termin „"+String(event.title)+"“ in den Papierkorb verschieben?"}>
                        Löschen
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head"><div><span className="eyebrow">Neu</span><h2>Termin anlegen</h2></div></div>
            <form action={createEventAction} className="form-stack">
              <label>Titel<input name="title" required placeholder="z. B. Vorstandssitzung" /></label>
              <label>Art
                <select name="eventType" defaultValue="club">
                  <option value="club">Verein</option>
                  <option value="league">Liga</option>
                  <option value="training">Training</option>
                  <option value="tournament">Turnier</option>
                  <option value="board">Vorstand</option>
                </select>
              </label>
              <div className="form-grid">
                <label>Start<input name="startsAt" type="datetime-local" required /></label>
                <label>Ende<input name="endsAt" type="datetime-local" /></label>
              </div>
              <label>Ort<input name="location" placeholder="Vereinsheim" /></label>
              <label>Beschreibung<textarea name="description" rows={3} /></label>
              <label className="checkbox-row">
                <input type="checkbox" name="createMeeting" />
                <span>Direkt als Vorstandssitzung anlegen</span>
              </label>
              <button className="primary-button" type="submit">Termin speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
