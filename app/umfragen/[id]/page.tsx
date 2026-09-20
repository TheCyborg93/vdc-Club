import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  deleteSurveyAction,
  duplicateSurveyAction,
  updateSurveyStatusAction,
} from "@/app/umfragen/actions";
import { SurveyShare } from "@/components/survey-share";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic = "force-dynamic";

const statusLabels: Record<string,string> = {
  draft: "Entwurf",
  active: "Aktiv",
  closed: "Beendet",
  archived: "Archiviert",
};

function formatDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export default async function SurveyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{id:string}>;
  searchParams: Promise<{
    created?:string;
    updated?:string;
    status?:string;
    duplicated?:string;
    error?:string;
  }>;
}) {
  const user = await requirePermission("surveys.read");
  const sql = getDb();
  if (!sql) notFound();

  const { id } = await params;
  const query = await searchParams;

  const [
    surveyRows,
    questionRows,
    optionRows,
    responseRows,
    choiceRows,
    textRows,
    identityFieldRows,
    identityValueRows,
    responseListRows,
    individualAnswerRows,
  ] = await Promise.all([
    sql`
      SELECT s.*,u.display_name AS creator_name
      FROM surveys s
      LEFT JOIN app_users u ON u.id=s.created_by_user_id
      WHERE s.id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT id::text,position,question_text,question_type,required,max_selections
      FROM survey_questions
      WHERE survey_id=${id}::uuid
      ORDER BY position
    `,
    sql`
      SELECT o.id::text,o.question_id::text,o.position,o.label
      FROM survey_options o
      JOIN survey_questions q ON q.id=o.question_id
      WHERE q.survey_id=${id}::uuid
      ORDER BY o.question_id,o.position
    `,
    sql`
      SELECT count(*)::int AS count
      FROM survey_responses
      WHERE survey_id=${id}::uuid
    `,
    sql`
      SELECT ao.option_id::text,count(*)::int AS count
      FROM survey_answer_options ao
      JOIN survey_answers a ON a.id=ao.answer_id
      JOIN survey_responses r ON r.id=a.response_id
      WHERE r.survey_id=${id}::uuid
      GROUP BY ao.option_id
    `,
    sql`
      SELECT q.id::text AS question_id,a.text_value,r.submitted_at
      FROM survey_answers a
      JOIN survey_questions q ON q.id=a.question_id
      JOIN survey_responses r ON r.id=a.response_id
      WHERE r.survey_id=${id}::uuid
        AND q.question_type='text'
        AND a.text_value IS NOT NULL
        AND btrim(a.text_value) <> ''
      ORDER BY r.submitted_at DESC
      LIMIT 200
    `,
    sql`
      SELECT id::text,position,label,field_type,required
      FROM survey_identity_fields
      WHERE survey_id=${id}::uuid
      ORDER BY position
    `,
    sql`
      SELECT
        v.response_id::text,
        v.field_id::text,
        v.value
      FROM survey_response_identity_values v
      JOIN survey_responses r ON r.id=v.response_id
      WHERE r.survey_id=${id}::uuid
    `,
    sql`
      SELECT id::text,submitted_at
      FROM survey_responses
      WHERE survey_id=${id}::uuid
      ORDER BY submitted_at DESC
      LIMIT 250
    `,
    sql`
      SELECT
        a.response_id::text,
        q.position,
        q.question_text,
        q.question_type,
        a.text_value,
        COALESCE(
          string_agg(o.label, ', ' ORDER BY o.position) FILTER (WHERE o.id IS NOT NULL),
          ''
        ) AS selected_options
      FROM survey_answers a
      JOIN survey_questions q ON q.id=a.question_id
      LEFT JOIN survey_answer_options ao ON ao.answer_id=a.id
      LEFT JOIN survey_options o ON o.id=ao.option_id
      JOIN survey_responses r ON r.id=a.response_id
      WHERE r.survey_id=${id}::uuid
      GROUP BY a.id,a.response_id,q.position,q.question_text,q.question_type,a.text_value
      ORDER BY a.response_id,q.position
    `,
  ]);

  const survey = surveyRows[0];
  if (!survey) notFound();

  const canWrite = hasPermission(user.roles, "surveys.write");
  const responseCount = Number(responseRows[0]?.count ?? 0);
  const isAnonymous = Boolean(survey.is_anonymous);

  const counts = new Map(choiceRows.map((row) => [String(row.option_id), Number(row.count)]));

  const optionsByQuestion = new Map<string, typeof optionRows>();
  for (const option of optionRows) {
    const key = String(option.question_id);
    if (!optionsByQuestion.has(key)) optionsByQuestion.set(key, []);
    optionsByQuestion.get(key)!.push(option);
  }

  const textByQuestion = new Map<string, typeof textRows>();
  for (const answer of textRows) {
    const key = String(answer.question_id);
    if (!textByQuestion.has(key)) textByQuestion.set(key, []);
    textByQuestion.get(key)!.push(answer);
  }

  const identityByResponse = new Map<string, Map<string,string>>();
  for (const row of identityValueRows) {
    const responseId = String(row.response_id);
    if (!identityByResponse.has(responseId)) {
      identityByResponse.set(responseId, new Map());
    }
    identityByResponse.get(responseId)!.set(String(row.field_id), String(row.value));
  }

  const answersByResponse = new Map<string, typeof individualAnswerRows>();
  for (const answer of individualAnswerRows) {
    const responseId = String(answer.response_id);
    if (!answersByResponse.has(responseId)) {
      answersByResponse.set(responseId, []);
    }
    answersByResponse.get(responseId)!.push(answer);
  }

  const deadline = formatDate(survey.ends_at);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <Link href="/umfragen" className="back-link">← Umfragen</Link>
          <span className="eyebrow">{String(survey.topic)}</span>
          <h1>{String(survey.title)}</h1>
          <p>{String(survey.description || "Keine zusätzliche Beschreibung hinterlegt.")}</p>
        </div>
        <span className={`survey-status survey-status-${survey.status}`}>
          {statusLabels[String(survey.status)] ?? String(survey.status)}
        </span>
      </section>

      {(query.created || query.updated || query.status || query.duplicated) && (
        <div className="form-success">Umfrage wurde aktualisiert.</div>
      )}
      {query.error === "not_editable" && (
        <div className="form-error">Nur unveröffentlichte Entwürfe ohne Antworten können bearbeitet werden.</div>
      )}

      <section className="stat-grid">
        <article className="stat-card">
          <span>Antworten</span>
          <strong>{responseCount}</strong>
          <small>{isAnonymous ? "anonym" : "mit Teilnehmerangaben"}</small>
        </article>
        <article className="stat-card">
          <span>Fragen</span>
          <strong>{questionRows.length}</strong>
          <small>in dieser Umfrage</small>
        </article>
        <article className="stat-card">
          <span>Modus</span>
          <strong>{isAnonymous ? "Anonym" : "Nicht anonym"}</strong>
          <small>{isAnonymous ? "keine Teilnehmerdaten" : `${identityFieldRows.length} Teilnehmerfelder`}</small>
        </article>
        <article className="stat-card">
          <span>Frist</span>
          <strong>{deadline ?? "Offen"}</strong>
          <small>{deadline ? "automatisches Ende" : "manuell beendbar"}</small>
        </article>
      </section>

      <section className="survey-detail-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Verteilen</span><h2>Öffentlicher Link & WhatsApp</h2></div>
          </div>
          <SurveyShare
            title={String(survey.title)}
            topic={String(survey.topic)}
            description={String(survey.description ?? "")}
            targetGroup={String(survey.target_group ?? "Alle")}
            deadline={deadline}
            publicPath={`/u/${survey.public_token}`}
            isAnonymous={isAnonymous}
          />
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Steuerung</span><h2>Status & Aktionen</h2></div>
          </div>

          <div className="survey-control-list">
            <div><span>Status</span><strong>{statusLabels[String(survey.status)] ?? String(survey.status)}</strong></div>
            <div><span>Teilnahme</span><strong>{isAnonymous ? "Anonym" : "Nicht anonym"}</strong></div>
            <div><span>Ergebnisse öffentlich</span><strong>{survey.results_visibility === "after_submit" ? "Nach Abgabe" : "Nein"}</strong></div>
            <div><span>Mehrfachteilnahme</span><strong>{survey.one_response_per_browser ? "Pro Browser begrenzt" : "Erlaubt"}</strong></div>
            <div><span>Erstellt von</span><strong>{survey.creator_name ? String(survey.creator_name) : "System"}</strong></div>
          </div>

          {canWrite && (
            <div className="survey-control-actions">
              {survey.status === "draft" && (
                <Link href={`/umfragen/${id}/bearbeiten`} className="ghost-button">Bearbeiten</Link>
              )}

              {survey.status === "draft" && (
                <form action={updateSurveyStatusAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="status" value="active" />
                  <button className="primary-button">Veröffentlichen</button>
                </form>
              )}

              {survey.status === "active" && (
                <form action={updateSurveyStatusAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="status" value="closed" />
                  <ConfirmSubmitButton
                    className="mini-button danger-button"
                    message="Umfrage jetzt manuell beenden? Danach sind über den öffentlichen Link keine weiteren Antworten möglich."
                  >
                    Jetzt beenden
                  </ConfirmSubmitButton>
                </form>
              )}

              {survey.status === "closed" && (
                <form action={updateSurveyStatusAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="status" value="active" />
                  <button className="ghost-button">Wieder öffnen</button>
                </form>
              )}

              {survey.status !== "archived" && (
                <form action={updateSurveyStatusAction}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="status" value="archived" />
                  <button className="ghost-button">Archivieren</button>
                </form>
              )}

              <form action={duplicateSurveyAction}>
                <input type="hidden" name="id" value={id} />
                <button className="ghost-button">Duplizieren</button>
              </form>
            </div>
          )}
        </article>
      </section>

      {!isAnonymous && (
        <article className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Teilnehmerangaben</span>
              <h2>Erfasste Personen</h2>
            </div>
            <span className="count-chip">{responseCount}</span>
          </div>

          {responseListRows.length === 0 ? (
            <div className="empty-state">Noch keine Teilnehmerangaben vorhanden.</div>
          ) : (
            <div className="survey-participant-list">
              {responseListRows.map((response, index) => {
                const values = identityByResponse.get(String(response.id)) ?? new Map<string,string>();
                return (
                  <article className="survey-participant-card" key={String(response.id)}>
                    <div className="survey-participant-head">
                      <strong>Teilnahme {responseCount - index}</strong>
                      <span>{formatDate(response.submitted_at)}</span>
                    </div>
                    <div className="survey-participant-fields">
                      {identityFieldRows.map((field) => (
                        <div key={String(field.id)}>
                          <span>{String(field.label)}</span>
                          <strong>{values.get(String(field.id)) || "–"}</strong>
                        </div>
                      ))}
                    </div>

                    <details className="survey-participant-answers">
                      <summary>Antworten dieser Person anzeigen</summary>
                      <div>
                        {(answersByResponse.get(String(response.id)) ?? []).map((answer, answerIndex) => {
                          const answerValue = String(answer.text_value ?? "").trim()
                            || String(answer.selected_options ?? "").trim()
                            || "Keine Antwort";
                          return (
                            <div key={answerIndex}>
                              <span>Frage {Number(answer.position)} · {String(answer.question_text)}</span>
                              <strong>{answerValue}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </article>
      )}

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Auswertung</span><h2>Ergebnisse</h2></div>
          <span className="count-chip">{responseCount} Teilnahmen</span>
        </div>

        {responseCount === 0 ? (
          <div className="empty-state">Noch keine Antworten eingegangen.</div>
        ) : (
          <div className="survey-result-stack">
            {questionRows.map((question) => {
              const questionId = String(question.id);
              const options = optionsByQuestion.get(questionId) ?? [];
              const texts = textByQuestion.get(questionId) ?? [];

              return (
                <section className="survey-result-card" key={questionId}>
                  <div className="survey-result-title">
                    <span>Frage {Number(question.position)}</span>
                    <h3>{String(question.question_text)}</h3>
                  </div>

                  {question.question_type === "text" ? (
                    <div className="survey-text-results">
                      {texts.length === 0 ? (
                        <span className="empty-state">Keine Freitextantworten.</span>
                      ) : texts.map((answer, index) => (
                        <blockquote key={index}>{String(answer.text_value)}</blockquote>
                      ))}
                    </div>
                  ) : (
                    <div className="survey-choice-results">
                      {options.map((option) => {
                        const count = counts.get(String(option.id)) ?? 0;
                        const percent = responseCount ? Math.round((count / responseCount) * 100) : 0;
                        return (
                          <div className="survey-choice-result" key={String(option.id)}>
                            <div><span>{String(option.label)}</span><strong>{count} · {percent}%</strong></div>
                            <div className="survey-result-track"><i style={{width:`${Math.min(percent,100)}%`}} /></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </article>

      <div className="survey-anonymous-note">
        <strong>{isAnonymous ? "Anonyme Erhebung" : "Nicht anonyme Erhebung"}</strong>
        <span>
          {isAnonymous
            ? "Es werden keine persönlichen Teilnehmerangaben mit der Antwort gespeichert."
            : "Die selbst definierten Teilnehmerfelder werden zusammen mit der jeweiligen Teilnahme gespeichert und sind intern in der Auswertung sichtbar."}
        </span>
      </div>

      {canWrite && (
        <article className="panel destructive-zone">
          <span className="eyebrow">Gefahrenbereich</span>
          <h2>Umfrage endgültig löschen</h2>
          <p>
            Beim Löschen werden die Umfrage, alle Fragen, Antworten, Teilnehmerangaben und Auswertungsdaten endgültig entfernt.
          </p>
          <form action={deleteSurveyAction}>
            <input type="hidden" name="id" value={id} />
            <ConfirmSubmitButton
              message={`Umfrage „${String(survey.title)}“ endgültig löschen? Alle Antworten und Auswertungen werden ebenfalls gelöscht.`}
              requireText="LÖSCHEN"
            >
              Umfrage endgültig löschen
            </ConfirmSubmitButton>
          </form>
        </article>
      )}
    </div>
  );
}
