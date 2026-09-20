"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

type BuilderQuestion = {
  text?: unknown;
  type?: unknown;
  required?: unknown;
  maxSelections?: unknown;
  options?: unknown;
};

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function localDateTimeToIso(raw: string, offsetRaw: string) {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  const offset = Number(offsetRaw || 0);
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min)) + offset * 60_000;
  return new Date(utc).toISOString();
}

function normalizeQuestions(raw: string) {
  let parsed: BuilderQuestion[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid_questions");
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 30) {
    throw new Error("invalid_questions");
  }

  return parsed.map((question, index) => {
    const text = String(question.text ?? "").trim();
    const type = String(question.type ?? "");
    const required = Boolean(question.required);
    if (!text || !["single", "multiple", "text"].includes(type)) {
      throw new Error("invalid_questions");
    }

    const options = type === "text"
      ? []
      : (Array.isArray(question.options) ? question.options : [])
          .map((option) => String(option).trim())
          .filter(Boolean);

    if (type !== "text" && options.length < 2) {
      throw new Error("invalid_options");
    }

    const maxRaw = Number(question.maxSelections);
    const maxSelections = type === "multiple" && Number.isFinite(maxRaw) && maxRaw > 0
      ? Math.min(Math.floor(maxRaw), options.length)
      : null;

    return { position: index + 1, text, type, required, maxSelections, options };
  });
}

function surveyToken() {
  return randomBytes(7).toString("base64url");
}

export async function createSurveyAction(formData: FormData) {
  const actor = await requirePermission("surveys.write");
  const sql = getDb();
  if (!sql) redirect("/umfragen/neu?error=database");

  const title = value(formData, "title");
  const topic = value(formData, "topic");
  const description = value(formData, "description");
  const targetGroup = value(formData, "targetGroup") || "Alle";
  const resultsVisibility = value(formData, "resultsVisibility") === "after_submit" ? "after_submit" : "internal";
  const thankYouText = value(formData, "thankYouText") || "Vielen Dank für deine Teilnahme.";
  const endsAt = localDateTimeToIso(value(formData, "endsAt"), value(formData, "timezoneOffset"));
  const publishNow = value(formData, "publishNow") === "1";

  if (!title || !topic) redirect("/umfragen/neu?error=missing");

  let questions;
  try {
    questions = normalizeQuestions(value(formData, "questionsJson"));
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_questions";
    redirect(`/umfragen/neu?error=${encodeURIComponent(code)}`);
  }

  const token = surveyToken();
  const rows = await sql`
    INSERT INTO surveys (
      public_token,title,topic,description,target_group,status,ends_at,
      results_visibility,thank_you_text,created_by_user_id,published_at
    )
    VALUES (
      ${token},${title},${topic},${description},${targetGroup},
      ${publishNow ? "active" : "draft"},
      ${endsAt}::timestamptz,
      ${resultsVisibility},${thankYouText},${actor.id}::uuid,
      ${publishNow ? new Date().toISOString() : null}::timestamptz
    )
    RETURNING id::text
  `;

  const surveyId = String(rows[0].id);

  for (const question of questions) {
    const questionRows = await sql`
      INSERT INTO survey_questions (
        survey_id,position,question_text,question_type,required,max_selections
      )
      VALUES (
        ${surveyId}::uuid,${question.position},${question.text},${question.type},
        ${question.required},${question.maxSelections}
      )
      RETURNING id::text
    `;
    const questionId = String(questionRows[0].id);

    for (let optionIndex = 0; optionIndex < question.options.length; optionIndex++) {
      await sql`
        INSERT INTO survey_options (question_id,position,label)
        VALUES (${questionId}::uuid,${optionIndex + 1},${question.options[optionIndex]})
      `;
    }
  }

  revalidatePath("/umfragen");
  redirect(`/umfragen/${surveyId}?created=1`);
}

export async function updateSurveyStatusAction(formData: FormData) {
  await requirePermission("surveys.write");
  const sql = getDb();
  if (!sql) redirect("/umfragen?error=database");

  const id = value(formData, "id");
  const next = value(formData, "status");
  if (!id || !["active", "closed", "archived"].includes(next)) redirect("/umfragen?error=invalid");

  await sql`
    UPDATE surveys
    SET
      status=${next},
      published_at=CASE WHEN ${next}='active' AND published_at IS NULL THEN now() ELSE published_at END,
      closed_at=CASE WHEN ${next}='closed' THEN now() ELSE closed_at END
    WHERE id=${id}::uuid
  `;

  revalidatePath("/umfragen");
  revalidatePath(`/umfragen/${id}`);
  redirect(`/umfragen/${id}?status=1`);
}

export async function duplicateSurveyAction(formData: FormData) {
  const actor = await requirePermission("surveys.write");
  const sql = getDb();
  if (!sql) redirect("/umfragen?error=database");

  const id = value(formData, "id");
  if (!id) redirect("/umfragen?error=invalid");

  const sourceRows = await sql`
    SELECT title,topic,description,target_group,results_visibility,thank_you_text
    FROM surveys WHERE id=${id}::uuid LIMIT 1
  `;
  const source = sourceRows[0];
  if (!source) redirect("/umfragen?error=not_found");

  const newRows = await sql`
    INSERT INTO surveys (
      public_token,title,topic,description,target_group,status,
      results_visibility,thank_you_text,created_by_user_id
    )
    VALUES (
      ${surveyToken()},${String(source.title) + " – Kopie"},${source.topic},${source.description},
      ${source.target_group},'draft',${source.results_visibility},${source.thank_you_text},${actor.id}::uuid
    )
    RETURNING id::text
  `;
  const newId = String(newRows[0].id);

  const questions = await sql`
    SELECT id::text,position,question_text,question_type,required,max_selections
    FROM survey_questions WHERE survey_id=${id}::uuid ORDER BY position
  `;

  for (const question of questions) {
    const inserted = await sql`
      INSERT INTO survey_questions (
        survey_id,position,question_text,question_type,required,max_selections
      )
      VALUES (
        ${newId}::uuid,${question.position},${question.question_text},${question.question_type},
        ${question.required},${question.max_selections}
      )
      RETURNING id::text
    `;
    const newQuestionId = String(inserted[0].id);
    const options = await sql`
      SELECT position,label FROM survey_options
      WHERE question_id=${question.id}::uuid ORDER BY position
    `;
    for (const option of options) {
      await sql`
        INSERT INTO survey_options (question_id,position,label)
        VALUES (${newQuestionId}::uuid,${option.position},${option.label})
      `;
    }
  }

  revalidatePath("/umfragen");
  redirect(`/umfragen/${newId}?duplicated=1`);
}

export async function submitSurveyResponseAction(formData: FormData) {
  const sql = getDb();
  const token = value(formData, "token");
  if (!sql || !token) redirect(`/u/${encodeURIComponent(token)}?error=unavailable`);

  const surveyRows = await sql`
    SELECT id::text,status,starts_at,ends_at
    FROM surveys WHERE public_token=${token} LIMIT 1
  `;
  const survey = surveyRows[0];
  if (!survey || survey.status !== "active") redirect(`/u/${token}?error=closed`);

  const now = Date.now();
  if (survey.starts_at && new Date(String(survey.starts_at)).getTime() > now) redirect(`/u/${token}?error=not_started`);
  if (survey.ends_at && new Date(String(survey.ends_at)).getTime() < now) redirect(`/u/${token}?error=closed`);

  const questions = await sql`
    SELECT id::text,question_type,required,max_selections
    FROM survey_questions WHERE survey_id=${survey.id}::uuid ORDER BY position
  `;
  const options = await sql`
    SELECT o.id::text,o.question_id::text
    FROM survey_options o
    JOIN survey_questions q ON q.id=o.question_id
    WHERE q.survey_id=${survey.id}::uuid
  `;

  const allowedOptions = new Map<string, Set<string>>();
  for (const option of options) {
    const questionId = String(option.question_id);
    if (!allowedOptions.has(questionId)) allowedOptions.set(questionId, new Set());
    allowedOptions.get(questionId)!.add(String(option.id));
  }

  const validated: Array<{questionId:string; type:string; text:string | null; optionIds:string[]}> = [];

  for (const question of questions) {
    const questionId = String(question.id);
    const type = String(question.question_type);
    const field = `q_${questionId}`;

    if (type === "text") {
      const textAnswer = value(formData, field);
      if (question.required && !textAnswer) redirect(`/u/${token}?error=required`);
      if (textAnswer.length > 5000) redirect(`/u/${token}?error=too_long`);
      validated.push({questionId,type,text:textAnswer || null,optionIds:[]});
      continue;
    }

    const selected = formData.getAll(field).map(String).filter(Boolean);
    const allowed = allowedOptions.get(questionId) ?? new Set<string>();
    if (selected.some((optionId) => !allowed.has(optionId))) redirect(`/u/${token}?error=invalid`);
    if (type === "single" && selected.length > 1) redirect(`/u/${token}?error=invalid`);
    if (question.required && selected.length === 0) redirect(`/u/${token}?error=required`);

    const maxSelections = Number(question.max_selections ?? 0);
    if (type === "multiple" && maxSelections > 0 && selected.length > maxSelections) {
      redirect(`/u/${token}?error=max`);
    }

    validated.push({questionId,type,text:null,optionIds:selected});
  }

  const responseRows = await sql`
    INSERT INTO survey_responses (survey_id)
    VALUES (${survey.id}::uuid)
    RETURNING id::text
  `;
  const responseId = String(responseRows[0].id);

  for (const answer of validated) {
    if (!answer.text && answer.optionIds.length === 0) continue;

    const answerRows = await sql`
      INSERT INTO survey_answers (response_id,question_id,text_value)
      VALUES (${responseId}::uuid,${answer.questionId}::uuid,${answer.text})
      RETURNING id::text
    `;
    const answerId = String(answerRows[0].id);

    for (const optionId of answer.optionIds) {
      await sql`
        INSERT INTO survey_answer_options (answer_id,option_id)
        VALUES (${answerId}::uuid,${optionId}::uuid)
      `;
    }
  }

  revalidatePath(`/u/${token}`);
  redirect(`/u/${token}?done=1`);
}
