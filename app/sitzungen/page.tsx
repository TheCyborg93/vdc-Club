import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { createMeetingAction } from "@/app/sitzungen/actions";

const errors: Record<string, string> = {
  database: "Die Datenbankverbindung fehlt.",
  missing: "Titel und Startzeit sind erforderlich.",
  protected_delete: "Diese Sitzung enthält bereits Beschlüsse oder Dokumente bzw. ist abgeschlossen und kann nicht gelöscht werden.",
};

export const dynamic = "force-dynamic";

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

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string }>;
}) {
  const actor = await requirePermission("meetings.read");
  const sql = getDb();
  const params = await searchParams;

  const [meetings, counts] = sql
    ? await Promise.all([
        sql`
          SELECT
            m.id::text,
            m.title,
            m.starts_at,
            m.location,
            m.status,
            count(DISTINCT ai.id)::int AS agenda_count,
            count(DISTINCT r.id)::int AS resolution_count,
            count(DISTINCT ma.member_id)::int AS attendee_count
          FROM meetings m
          LEFT JOIN agenda_items ai ON ai.meeting_id = m.id
          LEFT JOIN resolutions r ON r.meeting_id = m.id
          LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
          WHERE m.deleted_at IS NULL
          GROUP BY m.id
          ORDER BY
            CASE WHEN m.status IN ('planned','running') THEN 0 ELSE 1 END,
            m.starts_at DESC
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status = 'planned' AND starts_at >= now())::int AS planned,
            count(*) FILTER (WHERE EXTRACT(YEAR FROM starts_at) = EXTRACT(YEAR FROM CURRENT_DATE))::int AS year_count,
            (
              SELECT count(*)::int
              FROM agenda_items ai
              JOIN meetings mx ON mx.id=ai.meeting_id
              WHERE ai.status IN ('open','active')
                AND mx.deleted_at IS NULL
            ) AS open_agenda,
            (SELECT count(*)::int FROM resolutions WHERE EXTRACT(YEAR FROM decided_at) = EXTRACT(YEAR FROM CURRENT_DATE)) AS resolutions
          FROM meetings
          WHERE deleted_at IS NULL
        `,
      ])
    : [[], [{ planned: 0, year_count: 0, open_agenda: 0, resolutions: 0 }]];

  const count = counts[0] ?? {};
  const canWrite = hasPermission(actor.roles, "meetings.write");

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Vorstandssitzungen</h1>
          <p>Tagesordnung, Teilnehmer, Beschlüsse und Folgeaufgaben in einem durchgehenden Sitzungsablauf.</p>
        </div>
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {params.created && <div className="form-success">Sitzung wurde angelegt.</div>}
      {params.deleted && <div className="form-success">Sitzung wurde in den Papierkorb verschoben.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Geplant</span><strong>{Number(count.planned ?? 0)}</strong><small>kommende Sitzungen</small></article>
        <article className="stat-card"><span>Dieses Jahr</span><strong>{Number(count.year_count ?? 0)}</strong><small>Sitzungen</small></article>
        <article className="stat-card"><span>Offene TOPs</span><strong>{Number(count.open_agenda ?? 0)}</strong><small>noch zu behandeln</small></article>
        <article className="stat-card"><span>Beschlüsse</span><strong>{Number(count.resolutions ?? 0)}</strong><small>dieses Jahr</small></article>
      </section>

      <section className={canWrite ? "management-grid" : "management-grid single"}>
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Übersicht</span><h2>Sitzungen</h2></div></div>
          <div className="meeting-list">
            {meetings.length === 0 ? (
              <div className="empty-state">Noch keine Vorstandssitzungen vorhanden.</div>
            ) : meetings.map((meeting) => (
              <Link href={`/sitzungen/${meeting.id}`} className="meeting-row" key={String(meeting.id)}>
                <div className={`meeting-status-indicator meeting-${meeting.status}`} />
                <div className="meeting-main">
                  <strong>{String(meeting.title)}</strong>
                  <span>{formatDateTime(meeting.starts_at)} · {meeting.location ? String(meeting.location) : "Ort offen"}</span>
                </div>
                <div className="meeting-metrics">
                  <span>{Number(meeting.agenda_count)} TOPs</span>
                  <span>{Number(meeting.resolution_count)} Beschlüsse</span>
                  <span>{Number(meeting.attendee_count)} Personen</span>
                </div>
                <b className={`status-badge status-${meeting.status}`}>{String(meeting.status)}</b>
              </Link>
            ))}
          </div>
        </article>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head"><div><span className="eyebrow">Neu</span><h2>Sitzung anlegen</h2></div></div>
            <form action={createMeetingAction} className="form-stack">
              <label>Titel<input name="title" required placeholder="z. B. Vorstandssitzung September" /></label>
              <label>Start<input name="startsAt" type="datetime-local" required /></label>
              <label>Ort<input name="location" placeholder="Vereinsheim" /></label>
              <label>Vorbereitung / Notiz<textarea name="notes" rows={4} /></label>
              <button className="primary-button" type="submit">Sitzung anlegen</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
