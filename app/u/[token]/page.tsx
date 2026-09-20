import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { submitSurveyResponseAction } from "@/app/umfragen/actions";

export const dynamic = "force-dynamic";

function formatDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

const errors: Record<string,string> = {
  required: "Bitte beantworte alle Pflichtfragen.",
  max: "Bei mindestens einer Frage wurden zu viele Antworten ausgewählt.",
  invalid: "Eine Antwort war ungültig. Bitte versuche es erneut.",
  too_long: "Eine Freitextantwort ist zu lang.",
  closed: "Diese Umfrage ist nicht mehr aktiv.",
  not_started: "Diese Umfrage ist noch nicht gestartet.",
  unavailable: "Die Umfrage ist aktuell nicht verfügbar.",
};

export default async function PublicSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{token:string}>;
  searchParams: Promise<{done?:string;already?:string;error?:string}>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const sql = getDb();
  if (!sql) notFound();

  const surveyRows = await sql`
    SELECT id::text,title,topic,description,target_group,status,starts_at,ends_at,
           results_visibility,thank_you_text,one_response_per_browser
    FROM surveys
    WHERE public_token=${token}
    LIMIT 1
  `;
  const survey = surveyRows[0];
  if (!survey) notFound();

  const questions = await sql`
    SELECT id::text,position,question_text,question_type,required,max_selections,help_text
    FROM survey_questions
    WHERE survey_id=${survey.id}::uuid
    ORDER BY position
  `;
  const options = await sql`
    SELECT o.id::text,o.question_id::text,o.position,o.label
    FROM survey_options o
    JOIN survey_questions q ON q.id=o.question_id
    WHERE q.survey_id=${survey.id}::uuid
    ORDER BY o.question_id,o.position
  `;

  const optionsByQuestion = new Map<string, typeof options>();
  for (const option of options) {
    const key = String(option.question_id);
    if (!optionsByQuestion.has(key)) optionsByQuestion.set(key, []);
    optionsByQuestion.get(key)!.push(option);
  }

  const now = Date.now();
  const active =
    survey.status === "active" &&
    (!survey.starts_at || new Date(String(survey.starts_at)).getTime() <= now) &&
    (!survey.ends_at || new Date(String(survey.ends_at)).getTime() >= now);

  const jar = await cookies();
  const alreadySubmitted =
    Boolean(survey.one_response_per_browser) &&
    jar.get(`vdc_survey_done_${token}`)?.value === "1";

  let publicResults: Array<{option_id:string;count:number}> = [];
  let responseCount = 0;
  if ((query.done || alreadySubmitted) && survey.results_visibility === "after_submit") {
    const [responseRows, countRows] = await Promise.all([
      sql`SELECT count(*)::int AS count FROM survey_responses WHERE survey_id=${survey.id}::uuid`,
      sql`
        SELECT ao.option_id::text,count(*)::int AS count
        FROM survey_answer_options ao
        JOIN survey_answers a ON a.id=ao.answer_id
        JOIN survey_responses r ON r.id=a.response_id
        WHERE r.survey_id=${survey.id}::uuid
        GROUP BY ao.option_id
      `,
    ]);
    responseCount = Number(responseRows[0]?.count ?? 0);
    publicResults = countRows.map((row) => ({option_id:String(row.option_id),count:Number(row.count)}));
  }
  const resultMap = new Map(publicResults.map((row) => [row.option_id,row.count]));

  return (
    <main className="public-survey-page">
      <section className="public-survey-card">
        <header className="public-survey-header">
          <div className="public-survey-brand">
            <img src="/vdc-logo.svg" alt="" />
            <div><strong>VDC</strong><span>Vestischer Dart Club e.V.</span></div>
          </div>
          <span className="public-survey-anonymous">Anonym</span>
        </header>

        <div className="public-survey-intro">
          <span>{String(survey.topic)} · {String(survey.target_group)}</span>
          <h1>{String(survey.title)}</h1>
          {survey.description && <p>{String(survey.description)}</p>}
          {survey.ends_at && <small>Teilnahme bis {formatDate(survey.ends_at)}</small>}
        </div>

        {(query.done || alreadySubmitted) ? (
          <div className="public-survey-thanks">
            <div className="public-survey-check">✓</div>
            <h2>{alreadySubmitted && !query.done ? "Du hast bereits teilgenommen." : String(survey.thank_you_text)}</h2>
            <p>
              {alreadySubmitted && !query.done
                ? "Dieser Browser ist für diese Umfrage bereits als teilgenommen markiert."
                : "Deine Antworten wurden anonym gespeichert."}
            </p>

            {survey.results_visibility === "after_submit" && (
              <div className="public-survey-results">
                <h3>Aktueller Stand · {responseCount} Teilnahmen</h3>
                {questions.filter((question) => question.question_type !== "text").map((question) => (
                  <section key={String(question.id)}>
                    <strong>{String(question.question_text)}</strong>
                    {(optionsByQuestion.get(String(question.id)) ?? []).map((option) => {
                      const count = resultMap.get(String(option.id)) ?? 0;
                      const percent = responseCount ? Math.round((count / responseCount) * 100) : 0;
                      return (
                        <div className="public-result-row" key={String(option.id)}>
                          <div><span>{String(option.label)}</span><b>{percent}%</b></div>
                          <div><i style={{width:`${Math.min(percent,100)}%`}} /></div>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </div>
        ) : !active ? (
          <div className="public-survey-closed">
            <h2>Diese Umfrage ist aktuell nicht geöffnet.</h2>
            <p>{query.error ? errors[query.error] ?? "Die Teilnahme ist nicht möglich." : "Die Umfrage wurde noch nicht veröffentlicht oder bereits beendet."}</p>
          </div>
        ) : (
          <>
            {query.error && <div className="form-error">{errors[query.error] ?? "Bitte prüfe deine Antworten."}</div>}

            <form action={submitSurveyResponseAction} className="public-survey-form">
              <input type="hidden" name="token" value={token} />
              {questions.map((question) => {
                const questionOptions = optionsByQuestion.get(String(question.id)) ?? [];
                const field = `q_${question.id}`;

                return (
                  <fieldset className="public-survey-question" key={String(question.id)}>
                    <legend>
                      <span>Frage {Number(question.position)}</span>
                      <strong>{String(question.question_text)}</strong>
                      {question.required && <b>Pflicht</b>}
                    </legend>

                    {question.help_text && <p>{String(question.help_text)}</p>}

                    {question.question_type === "text" ? (
                      <textarea name={field} rows={5} required={Boolean(question.required)} maxLength={5000} placeholder="Deine Antwort …" />
                    ) : (
                      <div className="public-survey-options">
                        {questionOptions.map((option, index) => (
                          <label key={String(option.id)}>
                            <input
                              type={question.question_type === "single" ? "radio" : "checkbox"}
                              name={field}
                              value={String(option.id)}
                              required={question.question_type === "single" && Boolean(question.required) && index === 0}
                            />
                            <span>{String(option.label)}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {question.question_type === "multiple" && question.max_selections && (
                      <small>Maximal {Number(question.max_selections)} Antworten auswählen.</small>
                    )}
                  </fieldset>
                );
              })}

              <div className="public-survey-privacy">
                <strong>Anonyme Teilnahme</strong>
                <span>
                  Es werden keine Namen, Benutzerkonten, E-Mail-Adressen oder IP-Adressen mit deiner Antwort gespeichert.
                  {survey.one_response_per_browser ? " Für den Mehrfachschutz merkt sich nur dieser Browser die Teilnahme per Cookie." : ""}
                </span>
              </div>

              <button className="primary-button public-survey-submit" type="submit">Antworten absenden</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
