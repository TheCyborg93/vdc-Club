import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function formatDateTime(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function MinutesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("meetings.read");
  const sql = getDb();
  if (!sql) notFound();

  const { id } = await params;

  const [meetingRows, attendees, agenda] = await Promise.all([
    sql`
      SELECT id::text, title, starts_at, ended_at, location, status, notes
      FROM meetings
      WHERE id = ${id}::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `,
    sql`
      SELECT ma.attendance, m.first_name, m.last_name
      FROM meeting_attendees ma
      JOIN members m ON m.id = ma.member_id
      WHERE ma.meeting_id = ${id}::uuid
      ORDER BY
        CASE ma.attendance WHEN 'present' THEN 0 WHEN 'excused' THEN 1 ELSE 2 END,
        m.last_name,
        m.first_name
    `,
    sql`
      SELECT
        ai.position,
        ai.title,
        ai.description,
        ai.notes,
        ai.status,
        r.resolution_number,
        r.title AS resolution_title,
        r.decision_text,
        r.votes_yes,
        r.votes_no,
        r.votes_abstain,
        r.status AS resolution_status,
        t.title AS task_title,
        t.status AS task_status,
        t.due_date,
        owner.first_name AS owner_first_name,
        owner.last_name AS owner_last_name
      FROM agenda_items ai
      LEFT JOIN resolutions r ON r.agenda_item_id = ai.id
      LEFT JOIN tasks t
        ON t.source_type = 'resolution'
       AND t.source_id = r.id
       AND t.status <> 'cancelled'
       AND t.deleted_at IS NULL
      LEFT JOIN members owner ON owner.id = t.owner_member_id
      WHERE ai.meeting_id = ${id}::uuid
      ORDER BY ai.position
    `,
  ]);

  const meeting = meetingRows[0];
  if (!meeting) notFound();

  const present = attendees.filter((row) => row.attendance === "present");
  const excused = attendees.filter((row) => row.attendance === "excused");
  const absent = attendees.filter((row) => ["absent", "invited"].includes(String(row.attendance)));

  return (
    <main className="minutes-page">
      <div className="minutes-toolbar no-print">
        <Link href={`/sitzungen/${id}`} className="ghost-button">← Sitzung</Link>
        <span>Zum PDF-Export im Browser „Drucken“ → „Als PDF sichern“ verwenden.</span>
      </div>

      <article className="minutes-document">
        <header className="minutes-header">
          <div className="minutes-brand">VDC</div>
          <div>
            <span>Vestischer Darts Club</span>
            <h1>Sitzungsprotokoll</h1>
            <p>{String(meeting.title)}</p>
          </div>
        </header>

        <section className="minutes-meta">
          <div><span>Beginn</span><strong>{formatDateTime(meeting.starts_at)}</strong></div>
          <div><span>Ende</span><strong>{meeting.ended_at ? formatDateTime(meeting.ended_at) : "Noch nicht beendet"}</strong></div>
          <div><span>Ort</span><strong>{meeting.location ? String(meeting.location) : "–"}</strong></div>
          <div><span>Status</span><strong>{String(meeting.status)}</strong></div>
        </section>

        <section className="minutes-section">
          <h2>Teilnehmer</h2>
          <div className="minutes-attendance-grid">
            <div>
              <h3>Anwesend</h3>
              {present.length === 0 ? <p>–</p> : present.map((row) => (
                <p key={`${row.first_name}-${row.last_name}`}>{String(row.first_name)} {String(row.last_name)}</p>
              ))}
            </div>
            <div>
              <h3>Entschuldigt</h3>
              {excused.length === 0 ? <p>–</p> : excused.map((row) => (
                <p key={`${row.first_name}-${row.last_name}`}>{String(row.first_name)} {String(row.last_name)}</p>
              ))}
            </div>
            <div>
              <h3>Abwesend / offen</h3>
              {absent.length === 0 ? <p>–</p> : absent.map((row) => (
                <p key={`${row.first_name}-${row.last_name}`}>{String(row.first_name)} {String(row.last_name)}</p>
              ))}
            </div>
          </div>
        </section>

        {meeting.notes && (
          <section className="minutes-section">
            <h2>Vorbereitende Notiz</h2>
            <p>{String(meeting.notes)}</p>
          </section>
        )}

        <section className="minutes-section">
          <h2>Tagesordnung & Ergebnisse</h2>
          <div className="minutes-agenda">
            {agenda.length === 0 ? (
              <p>Keine Tagesordnungspunkte hinterlegt.</p>
            ) : agenda.map((item) => (
              <section className="minutes-top" key={String(item.position)}>
                <div className="minutes-top-title">
                  <span>TOP {String(item.position).padStart(2, "0")}</span>
                  <h3>{String(item.title)}</h3>
                </div>
                {item.description && <p>{String(item.description)}</p>}
                {item.notes && <p><strong>Notiz:</strong> {String(item.notes)}</p>}

                {item.resolution_number && (
                  <div className="minutes-resolution">
                    <div className="minutes-resolution-head">
                      <strong>Beschluss {String(item.resolution_number)}</strong>
                      <span>{String(item.resolution_status)}</span>
                    </div>
                    <h4>{String(item.resolution_title)}</h4>
                    <p>{String(item.decision_text)}</p>
                    <p className="minutes-vote">
                      Abstimmung: {Number(item.votes_yes)} Ja · {Number(item.votes_no)} Nein · {Number(item.votes_abstain)} Enthaltung
                    </p>
                    {item.task_title && (
                      <div className="minutes-task">
                        <strong>Folgeaufgabe:</strong> {String(item.task_title)}
                        {item.owner_first_name ? ` · ${item.owner_first_name} ${item.owner_last_name}` : ""}
                        {item.due_date
                          ? ` · Frist ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin" }).format(new Date(String(item.due_date)))}`
                          : ""}
                        {item.task_status ? ` · ${item.task_status}` : ""}
                      </div>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        </section>

        <footer className="minutes-signatures">
          <div><span>____________________________</span><strong>Sitzungsleitung</strong></div>
          <div><span>____________________________</span><strong>Protokollführung</strong></div>
        </footer>
      </article>
    </main>
  );
}
