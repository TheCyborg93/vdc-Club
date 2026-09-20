import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { SurveyBuilder } from "@/components/survey-builder";

export const dynamic = "force-dynamic";

const errors: Record<string,string> = {
  invalid_questions: "Bitte mindestens eine gültige Frage anlegen.",
  invalid_options: "Auswahlfragen benötigen mindestens zwei Antwortmöglichkeiten.",
  invalid_identity_fields: "Bei einer nicht anonymen Umfrage muss mindestens ein gültiges Teilnehmerfeld vorhanden sein.",
  duplicate_identity_fields: "Teilnehmerfelder dürfen nicht dieselbe Bezeichnung haben.",
};

export default async function EditSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{id:string}>;
  searchParams: Promise<{error?:string}>;
}) {
  await requirePermission("surveys.write");
  const sql = getDb();
  if (!sql) notFound();

  const { id } = await params;
  const query = await searchParams;

  const surveyRows = await sql`
    SELECT
      id::text,title,topic,description,target_group,status,
      to_char(ends_at AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD"T"HH24:MI') AS ends_at_local,
      results_visibility,thank_you_text,one_response_per_browser,is_anonymous,
      (SELECT count(*)::int FROM survey_responses r WHERE r.survey_id=surveys.id) AS responses
    FROM surveys
    WHERE id=${id}::uuid
    LIMIT 1
  `;
  const survey = surveyRows[0];
  if (!survey) notFound();

  if (survey.status !== "draft" || Number(survey.responses ?? 0) > 0) {
    redirect(`/umfragen/${id}?error=not_editable`);
  }

  const [questionRows, optionRows, identityRows] = await Promise.all([
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
      SELECT id::text,position,label,field_type,required
      FROM survey_identity_fields
      WHERE survey_id=${id}::uuid
      ORDER BY position
    `,
  ]);

  const optionsByQuestion = new Map<string,string[]>();
  for (const option of optionRows) {
    const key = String(option.question_id);
    if (!optionsByQuestion.has(key)) optionsByQuestion.set(key, []);
    optionsByQuestion.get(key)!.push(String(option.label));
  }

  const identityFields = identityRows.map((field) => ({
    id: String(field.id),
    label: String(field.label),
    type: String(field.field_type) as "text" | "email" | "tel" | "number",
    required: Boolean(field.required),
  }));

  const questions = questionRows.map((question) => ({
    id: String(question.id),
    text: String(question.question_text),
    type: String(question.question_type) as "single" | "multiple" | "text",
    required: Boolean(question.required),
    maxSelections: question.max_selections ? Number(question.max_selections) : null,
    options: optionsByQuestion.get(String(question.id)) ?? [],
  }));

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <Link href={`/umfragen/${id}`} className="back-link">← Umfrage</Link>
          <span className="eyebrow">Entwurf</span>
          <h1>Umfrage bearbeiten</h1>
          <p>Solange die Umfrage nicht veröffentlicht wurde, können Inhalt und Fragen vollständig geändert werden.</p>
        </div>
      </section>

      {query.error && (
        <div className="form-error">
          {errors[query.error] ?? "Die Änderungen konnten nicht gespeichert werden."}
        </div>
      )}

      <SurveyBuilder
        mode="edit"
        surveyId={id}
        initial={{
          title: String(survey.title),
          topic: String(survey.topic),
          description: String(survey.description ?? ""),
          targetGroup: String(survey.target_group ?? "Alle"),
          endsAtLocal: String(survey.ends_at_local ?? ""),
          resultsVisibility: survey.results_visibility === "after_submit" ? "after_submit" : "internal",
          thankYouText: String(survey.thank_you_text ?? "Vielen Dank für deine Teilnahme."),
          oneResponsePerBrowser: Boolean(survey.one_response_per_browser),
          isAnonymous: Boolean(survey.is_anonymous),
          identityFields,
          questions,
        }}
      />
    </div>
  );
}
