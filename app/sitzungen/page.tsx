import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { createMeetingAction } from "@/app/sitzungen/actions";
import { meetingStatusLabel } from "@/lib/ui-labels";

const minutesStatusLabels:Record<string,string>={
  draft:"Entwurf",
  review:"In Prüfung",
  approved:"Freigegeben",
  archived:"Archiviert",
};

const modeLabels:Record<string,string>={
  in_person:"Präsenz",
  hybrid:"Hybrid",
  online:"Online",
};

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

function readiness(row:Record<string,unknown>) {
  return [
    row.chair_member_id,
    row.minute_taker_member_id,
    row.invitation_timely!=null,
    row.agenda_sent_with_invitation!=null,
    row.quorum_confirmed!=null,
  ].filter(Boolean).length;
}

function MeetingCard({meeting}:{meeting:Record<string,unknown>}) {
  const ready=readiness(meeting);
  const running=meeting.status==="running";
  return (
    <Link href={`/sitzungen/${String(meeting.id)}`} className={`meeting-overview-card ${running ? "is-running" : ""}`}>
      <div className="meeting-overview-main">
        <div className="meeting-overview-title">
          <span className={`meeting-status-indicator meeting-${String(meeting.status)}`} />
          <div>
            <strong>{String(meeting.title)}</strong>
            <span>
              {formatDateTime(meeting.starts_at)}
              {" · "}
              {meeting.location ? String(meeting.location) : "Ort offen"}
            </span>
          </div>
        </div>
        <div className="meeting-overview-badges">
          <span>{modeLabels[String(meeting.meeting_mode)] ?? "Präsenz"}</span>
          <span>{Number(meeting.agenda_count ?? 0)} TOPs</span>
          <span>{Number(meeting.resolution_count ?? 0)} Beschlüsse</span>
          <span>{Number(meeting.attendee_count ?? 0)} Personen</span>
        </div>
      </div>

      <div className="meeting-overview-readiness">
        <div>
          <span>Vorbereitung</span>
          <strong>{ready}/5</strong>
        </div>
        <div className="meeting-mini-progress" aria-hidden="true">
          <i style={{width:`${Math.round((ready/5)*100)}%`}} />
        </div>
      </div>

      <div className="meeting-overview-state">
        <b className={`status-badge status-${String(meeting.status)}`}>
          {meetingStatusLabel(meeting.status)}
        </b>
        <span className={`minutes-status minutes-${String(meeting.minutes_status)}`}>
          Protokoll · {minutesStatusLabels[String(meeting.minutes_status)] ?? String(meeting.minutes_status)}
        </span>
      </div>
    </Link>
  );
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
            m.minutes_status,
            m.meeting_mode,
            m.chair_member_id::text,
            m.minute_taker_member_id::text,
            m.invitation_timely,
            m.agenda_sent_with_invitation,
            m.quorum_confirmed,
            count(DISTINCT ai.id)::int AS agenda_count,
            count(DISTINCT ai.id) FILTER (WHERE ai.status IN ('open','active'))::int AS open_agenda_count,
            count(DISTINCT r.id)::int AS resolution_count,
            count(DISTINCT ma.member_id)::int AS attendee_count
          FROM meetings m
          LEFT JOIN agenda_items ai ON ai.meeting_id = m.id
          LEFT JOIN resolutions r ON r.meeting_id = m.id
          LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
          WHERE m.deleted_at IS NULL
          GROUP BY m.id
          ORDER BY
            CASE m.status
              WHEN 'running' THEN 0
              WHEN 'planned' THEN 1
              WHEN 'completed' THEN 2
              ELSE 3
            END,
            CASE WHEN m.status IN ('running','planned') THEN m.starts_at END ASC,
            m.starts_at DESC
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status = 'planned' AND starts_at >= now())::int AS planned,
            count(*) FILTER (WHERE status = 'running')::int AS running,
            count(*) FILTER (WHERE EXTRACT(YEAR FROM starts_at) = EXTRACT(YEAR FROM CURRENT_DATE))::int AS year_count,
            (
              SELECT count(*)::int
              FROM agenda_items ai
              JOIN meetings mx ON mx.id=ai.meeting_id
              WHERE ai.status IN ('open','active')
                AND mx.deleted_at IS NULL
            ) AS open_agenda,
            (
              SELECT count(*)::int
              FROM resolutions
              WHERE EXTRACT(YEAR FROM decided_at) = EXTRACT(YEAR FROM CURRENT_DATE)
            ) AS resolutions,
            count(*) FILTER (
              WHERE status='completed' AND minutes_status='draft'
            )::int AS minutes_open,
            count(*) FILTER (
              WHERE minutes_status='review'
            )::int AS minutes_review
          FROM meetings
          WHERE deleted_at IS NULL
        `,
      ])
    : [[], [{ planned: 0, running:0, year_count: 0, open_agenda: 0, resolutions: 0, minutes_open:0, minutes_review:0 }]];

  const count = counts[0] ?? {};
  const canWrite = hasPermission(actor.roles, "meetings.write");
  const upcoming=meetings.filter((row)=>["planned","running"].includes(String(row.status)));
  const history=meetings.filter((row)=>!["planned","running"].includes(String(row.status)));
  const focus=upcoming.find((row)=>row.status==="running") ?? upcoming[0] ?? null;

  return (
    <div className="page-stack meetings-overview-page">
      <section className="meetings-overview-hero">
        <div>
          <span className="eyebrow">Vorstandsarbeit</span>
          <h1>Vorstandssitzungen</h1>
          <p>Vorbereiten, durchführen, beschließen und protokollieren – in einem durchgängigen Arbeitsablauf.</p>
        </div>
        {canWrite && (
          <a href="#neue-sitzung" className="primary-button">Neue Sitzung</a>
        )}
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {params.created && <div className="form-success">Sitzung wurde angelegt.</div>}
      {params.deleted && <div className="form-success">Sitzung wurde in den Papierkorb verschoben.</div>}

      <section className="meetings-kpi-strip">
        <article>
          <span>Aktuell</span>
          <strong>{Number(count.running ?? 0) ? "Live" : Number(count.planned ?? 0)}</strong>
          <small>{Number(count.running ?? 0) ? "Sitzung läuft" : "geplant"}</small>
        </article>
        <article>
          <span>Offene TOPs</span>
          <strong>{Number(count.open_agenda ?? 0)}</strong>
          <small>noch zu behandeln</small>
        </article>
        <article>
          <span>Beschlüsse</span>
          <strong>{Number(count.resolutions ?? 0)}</strong>
          <small>dieses Jahr</small>
        </article>
        <article>
          <span>Protokolle</span>
          <strong>{Number(count.minutes_open ?? 0)}</strong>
          <small>{Number(count.minutes_review ?? 0)} in Prüfung</small>
        </article>
      </section>

      {focus && (
        <section className="meeting-focus-overview">
          <div className="meeting-focus-overview-copy">
            <span className="eyebrow">{focus.status==="running" ? "Laufende Sitzung" : "Nächste Sitzung"}</span>
            <h2>{String(focus.title)}</h2>
            <p>{formatDateTime(focus.starts_at)} · {focus.location ? String(focus.location) : "Ort offen"}</p>
            <div>
              <span>{modeLabels[String(focus.meeting_mode)] ?? "Präsenz"}</span>
              <span>{Number(focus.agenda_count ?? 0)} TOPs</span>
              <span>{Number(focus.attendee_count ?? 0)} Personen</span>
              <span>{readiness(focus)}/5 Vorbereitung</span>
            </div>
          </div>
          <div className="meeting-focus-overview-actions">
            <b className={`status-badge status-${String(focus.status)}`}>{meetingStatusLabel(focus.status)}</b>
            <Link href={`/sitzungen/${String(focus.id)}`} className="primary-button">
              {focus.status==="running" ? "Sitzung fortsetzen" : "Vorbereitung öffnen"}
            </Link>
          </div>
        </section>
      )}

      <section className="meetings-overview-section">
        <div className="meetings-section-head">
          <div>
            <span className="eyebrow">Arbeitsbereich</span>
            <h2>Kommend & laufend</h2>
          </div>
          <span>{upcoming.length}</span>
        </div>
        <div className="meetings-overview-list">
          {upcoming.length===0
            ? <div className="empty-state">Keine kommende Vorstandssitzung geplant.</div>
            : upcoming.map((meeting)=><MeetingCard key={String(meeting.id)} meeting={meeting} />)}
        </div>
      </section>

      {canWrite && (
        <details className="meeting-create-drawer" id="neue-sitzung">
          <summary>
            <div>
              <span className="eyebrow">Planung</span>
              <strong>Neue Vorstandssitzung anlegen</strong>
            </div>
            <b>+</b>
          </summary>
          <form action={createMeetingAction} className="meeting-create-form">
            <label>Titel<input name="title" required placeholder="z. B. Vorstandssitzung Oktober" /></label>
            <label>Start<input name="startsAt" type="datetime-local" required /></label>
            <label>Ort<input name="location" placeholder="Vereinsheim" /></label>
            <label className="wide">Vorbereitung / Notiz<textarea name="notes" rows={3} /></label>
            <button className="primary-button wide" type="submit">Sitzung anlegen</button>
          </form>
        </details>
      )}

      <section className="meetings-overview-section meetings-history-section">
        <div className="meetings-section-head">
          <div>
            <span className="eyebrow">Archiv & Verlauf</span>
            <h2>Abgeschlossen</h2>
          </div>
          <span>{history.length}</span>
        </div>
        <div className="meetings-overview-list">
          {history.length===0
            ? <div className="empty-state">Noch keine abgeschlossenen Sitzungen vorhanden.</div>
            : history.map((meeting)=><MeetingCard key={String(meeting.id)} meeting={meeting} />)}
        </div>
      </section>
    </div>
  );
}
