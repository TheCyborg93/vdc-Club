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

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{deleted?:string;view?:string}>;
}) {
  const user = await requirePermission("surveys.read");
  const query = await searchParams;
  const sql = getDb();
  const canWrite = hasPermission(user.roles, "surveys.write");
  const view=["active","draft","closed","all"].includes(query.view ?? "")
    ? String(query.view)
    : "active";

  const surveys = sql ? await sql`
    SELECT
      s.id::text,
      s.title,
      s.topic,
      s.target_group,
      s.status,
      s.is_anonymous,
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
  const closed = surveys.filter((survey) => ["closed","archived"].includes(String(survey.status))).length;
  const overdueActive = surveys.filter(
    (survey) =>
      survey.status==="active" &&
      survey.ends_at &&
      new Date(String(survey.ends_at)).getTime()<=Date.now(),
  ).length;
  const responses = surveys.reduce((sum, survey) => sum + Number(survey.responses ?? 0), 0);
  const visibleSurveys=surveys.filter((survey)=>{
    if (view==="all") return true;
    if (view==="active") return survey.status==="active";
    if (view==="draft") return survey.status==="draft";
    return ["closed","archived"].includes(String(survey.status));
  });

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Umfragen</h1>
          <p>Anonyme oder nicht anonyme Vereinsumfragen erstellen, verteilen und zentral auswerten.</p>
        </div>
        {canWrite && <Link href="/umfragen/neu" className="primary-button">+ Neue Umfrage</Link>}
      </section>

      <section className="stat-grid">
        <article className="stat-card"><span>Umfragen</span><strong>{surveys.length}</strong><small>gesamt</small></article>
        <article className="stat-card"><span>Aktiv</span><strong>{active}</strong><small>öffentlich erreichbar</small></article>
        <article className="stat-card"><span>Entwürfe</span><strong>{drafts}</strong><small>noch nicht veröffentlicht</small></article>
        <article className="stat-card"><span>Antworten</span><strong>{responses}</strong><small>insgesamt eingegangen</small></article>
      </section>

      {query.deleted && <div className="form-success">Umfrage wurde endgültig gelöscht.</div>}

      <nav className="survey-view-tabs" aria-label="Umfragen filtern">
        <Link href="/umfragen" className={view==="active" ? "is-active" : ""}>
          Aktiv <span>{active}</span>
        </Link>
        <Link href="/umfragen?view=draft" className={view==="draft" ? "is-active" : ""}>
          Entwürfe <span>{drafts}</span>
        </Link>
        <Link href="/umfragen?view=closed" className={view==="closed" ? "is-active" : ""}>
          Beendet <span>{closed}</span>
        </Link>
        <Link href="/umfragen?view=all" className={view==="all" ? "is-active" : ""}>
          Alle <span>{surveys.length}</span>
        </Link>
      </nav>

      {overdueActive>0 && (
        <div className="survey-overdue-banner">
          <strong>{overdueActive} aktive Umfrage(n) mit abgelaufener Frist</strong>
          <span>Diese Umfragen nehmen öffentlich bereits keine Antworten mehr an und sollten formal beendet werden.</span>
        </div>
      )}

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Übersicht</span><h2>Alle Umfragen</h2></div>
        </div>

        <div className="survey-list">
          {visibleSurveys.length === 0 ? (
            <div className="empty-state">Keine Umfrage in dieser Ansicht.</div>
          ) : visibleSurveys.map((survey) => { 
            const deadlinePassed=
              survey.status==="active" &&
              Boolean(survey.ends_at) &&
              new Date(String(survey.ends_at)).getTime()<=Date.now();
            return (
            <Link href={`/umfragen/${survey.id}`} className="survey-list-row" key={String(survey.id)}>
              <div className="survey-list-main">
                <span>{String(survey.topic)} · {String(survey.target_group)}</span>
                <strong>{String(survey.title)}</strong>
                <small>
                  {Number(survey.questions)} Fragen · {Number(survey.responses)} Antworten · {survey.is_anonymous ? "Anonym" : "Nicht anonym"}
                </small>
              </div>
              <div className="survey-list-meta">
                {deadlinePassed && <span className="survey-deadline-chip">Frist abgelaufen</span>}
                <span className={`survey-status survey-status-${survey.status}`}>
                  {statusLabels[String(survey.status)] ?? String(survey.status)}
                </span>
                <small>{survey.ends_at ? `Bis ${formatDate(survey.ends_at)}` : "Ohne Frist"}</small>
              </div>
              <b>›</b>
            </Link>
            );
          })}
        </div>
      </article>
    </div>
  );
}
