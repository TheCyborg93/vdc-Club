import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const statusLabels: Record<string,string> = {
  draft: "Entwurf",
  active: "Aktiv",
  closed: "Beendet",
  archived: "Archiviert",
};

function formatDate(value: unknown) {
  if (!value) return "Keine Frist";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Keine Frist";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function SurveysPage() {
  const user = await requirePermission("surveys.read");
  const sql = getDb();
  const canWrite = hasPermission(user.roles, "surveys.write");

  const surveys = sql ? await sql`
    SELECT
      s.id::text,
      s.title,
      s.topic,
      s.target_group,
      s.status,
      s.ends_at,
      s.created_at,
      count(DISTINCT r.id)::int AS responses,
      count(DISTINCT q.id)::int AS questions
    FROM surveys s
    LEFT JOIN survey_responses r ON r.survey_id=s.id
    LEFT JOIN survey_questions q ON q.survey_id=s.id
    GROUP BY s.id
    ORDER BY
      CASE s.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END,
      s.created_at DESC
  ` : [];

  const active = surveys.filter((survey) => survey.status === "active").length;
  const drafts = surveys.filter((survey) => survey.status === "draft").length;
  const responses = surveys.reduce((sum, survey) => sum + Number(survey.responses ?? 0), 0);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Umfragen</h1>
          <p>Anonyme Vereinsumfragen erstellen, verteilen und zentral auswerten.</p>
        </div>
        {canWrite && <Link href="/umfragen/neu" className="primary-button">+ Neue Umfrage</Link>}
      </section>

      <section className="stat-grid">
        <article className="stat-card"><span>Umfragen</span><strong>{surveys.length}</strong><small>gesamt</small></article>
        <article className="stat-card"><span>Aktiv</span><strong>{active}</strong><small>öffentlich erreichbar</small></article>
        <article className="stat-card"><span>Entwürfe</span><strong>{drafts}</strong><small>noch nicht veröffentlicht</small></article>
        <article className="stat-card"><span>Antworten</span><strong>{responses}</strong><small>anonym eingegangen</small></article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Übersicht</span><h2>Alle Umfragen</h2></div>
        </div>

        <div className="survey-list">
          {surveys.length === 0 ? (
            <div className="empty-state">Noch keine Umfrage vorhanden.</div>
          ) : surveys.map((survey) => (
            <Link href={`/umfragen/${survey.id}`} className="survey-list-row" key={String(survey.id)}>
              <div className="survey-list-main">
                <span>{String(survey.topic)} · {String(survey.target_group)}</span>
                <strong>{String(survey.title)}</strong>
                <small>{Number(survey.questions)} Fragen · {Number(survey.responses)} Antworten</small>
              </div>
              <div className="survey-list-meta">
                <span className={`survey-status survey-status-${survey.status}`}>
                  {statusLabels[String(survey.status)] ?? String(survey.status)}
                </span>
                <small>{survey.ends_at ? `Bis ${formatDate(survey.ends_at)}` : "Ohne Frist"}</small>
              </div>
              <b>›</b>
            </Link>
          ))}
        </div>
      </article>
    </div>
  );
}
