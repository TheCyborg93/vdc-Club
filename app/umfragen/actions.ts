"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

type BuilderQuestion = {
  text?: unknown;
  type?: unknown;
  required?: unknown;
  maxSelections?: unknown;
  options?: unknown;
};

type BuilderIdentityField = {
  label?: unknown;
  type?: unknown;
  required?: unknown;
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

    return {
      position: index + 1,
      text,
      type,
      required,
      maxSelections,
      options,
    };
  });
}

function normalizeIdentityFields(raw: string, isAnonymous: boolean) {
  if (isAnonymous) return [];

  let parsed: BuilderIdentityField[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid_identity_fields");
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) {
    throw new Error("invalid_identity_fields");
  }

  const fields = parsed.map((field, index) => {
    const label = String(field.label ?? "").trim();
    const type = String(field.type ?? "text");
    const required = Boolean(field.required);

    if (!label || !["text", "email", "tel", "number"].includes(type)) {
      throw new Error("invalid_identity_fields");
    }

    return {
      position: index + 1,
      label,
      type,
      required,
    };
  });

  const normalizedLabels = fields.map((field) => field.label.toLocaleLowerCase("de-DE"));
  if (new Set(normalizedLabels).size !== normalizedLabels.length) {
    throw new Error("duplicate_identity_fields");
  }

  return fields;
}

function surveyToken() {
  return randomBytes(7).toString("base64url");
}

async function insertQuestions(sql: NonNullable<ReturnType<typeof getDb>>, surveyId: string, questions: ReturnType<typeof normalizeQuestions>) {
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
}

async function insertIdentityFields(
  sql: NonNullable<ReturnType<typeof getDb>>,
  surveyId: string,
  fields: ReturnType<typeof normalizeIdentityFields>,
) {
  for (const field of fields) {
    await sql`
      INSERT INTO survey_identity_fields (
        survey_id,position,label,field_type,required
      )
      VALUES (
        ${surveyId}::uuid,${field.position},${field.label},${field.type},${field.required}
      )
    `;
  }
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
  const oneResponsePerBrowser = value(formData, "oneResponsePerBrowser") === "1";
  const isAnonymous = value(formData, "isAnonymous") !== "0";

  if (!title || !topic) redirect("/umfragen/neu?error=missing");

  let questions;
  let identityFields;
  try {
    questions = normalizeQuestions(value(formData, "questionsJson"));
    identityFields = normalizeIdentityFields(value(formData, "identityFieldsJson"), isAnonymous);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid";
    redirect(`/umfragen/neu?error=${encodeURIComponent(code)}`);
  }

  const token = surveyToken();
  const rows = await sql`
    INSERT INTO surveys (
      public_token,title,topic,description,target_group,status,ends_at,
      results_visibility,thank_you_text,one_response_per_browser,is_anonymous,
      created_by_user_id,published_at
    )
    VALUES (
      ${token},${title},${topic},${description},${targetGroup},
      ${publishNow ? "active" : "draft"},${endsAt}::timestamptz,
      ${resultsVisibility},${thankYouText},${oneResponsePerBrowser},${isAnonymous},
      ${actor.id}::uuid,${publishNow ? new Date().toISOString() : null}::timestamptz
    )
    RETURNING id::text
  `;

  const surveyId = String(rows[0].id);
  await insertIdentityFields(sql, surveyId, identityFields);
  await insertQuestions(sql, surveyId, questions);

  await writeAudit(actor.id, "survey.created", "survey", surveyId, {
    title,
    anonymous: isAnonymous,
    questions: questions.length,
    identityFields: identityFields.length,
  });

  revalidatePath("/umfragen");
  redirect(`/umfragen/${surveyId}?created=1`);
}

export async function updateSurveyDraftAction(formData: FormData) {
  const actor = await requirePermission("surveys.write");
  const sql = getDb();
  if (!sql) redirect("/umfragen?error=database");

  const id = value(formData, "surveyId");
  const title = value(formData, "title");
  const topic = value(formData, "topic");
  const description = value(formData, "description");
  const targetGroup = value(formData, "targetGroup") || "Alle";
  const resultsVisibility = value(formData, "resultsVisibility") === "after_submit" ? "after_submit" : "internal";
  const thankYouText = value(formData, "thankYouText") || "Vielen Dank für deine Teilnahme.";
  const endsAt = localDateTimeToIso(value(formData, "endsAt"), value(formData, "timezoneOffset"));
  const publishNow = value(formData, "publishNow") === "1";
  const oneResponsePerBrowser = value(formData, "oneResponsePerBrowser") === "1";
  const isAnonymous = value(formData, "isAnonymous") !== "0";

  if (!id || !title || !topic) redirect("/umfragen?error=invalid");

  const stateRows = await sql`
    SELECT status,(SELECT count(*)::int FROM survey_responses r WHERE r.survey_id=s.id) AS responses
    FROM surveys s
    WHERE s.id=${id}::uuid
    LIMIT 1
  `;
  const state = stateRows[0];

  if (!state || state.status !== "draft" || Number(state.responses ?? 0) > 0) {
    redirect(`/umfragen/${id}?error=not_editable`);
  }

  let questions;
  let identityFields;
  try {
    questions = normalizeQuestions(value(formData, "questionsJson"));
    identityFields = normalizeIdentityFields(value(formData, "identityFieldsJson"), isAnonymous);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid";
    redirect(`/umfragen/${id}/bearbeiten?error=${encodeURIComponent(code)}`);
  }

  await sql`
    UPDATE surveys
    SET
      title=${title},
      topic=${topic},
      description=${description},
      target_group=${targetGroup},
      ends_at=${endsAt}::timestamptz,
      results_visibility=${resultsVisibility},
      thank_you_text=${thankYouText},
      one_response_per_browser=${oneResponsePerBrowser},
      is_anonymous=${isAnonymous},
      status=${publishNow ? "active" : "draft"},
      published_at=CASE WHEN ${publishNow} THEN now() ELSE published_at END
    WHERE id=${id}::uuid
  `;

  await sql`DELETE FROM survey_identity_fields WHERE survey_id=${id}::uuid`;
  await sql`DELETE FROM survey_questions WHERE survey_id=${id}::uuid`;

  await insertIdentityFields(sql, id, identityFields);
  await insertQuestions(sql, id, questions);

  await writeAudit(actor.id, "survey.updated", "survey", id, {
    title,
    anonymous: isAnonymous,
    published: publishNow,
  });

  revalidatePath("/umfragen");
  revalidatePath(`/umfragen/${id}`);
  redirect(`/umfragen/${id}?updated=1`);
}

export async function updateSurveyStatusAction(formData: FormData) {
  const actor = await requirePermission("surveys.write");
  const sql = getDb();
  if (!sql) redirect("/umfragen?error=database");

  const id = value(formData, "id");
  const next = value(formData, "status");
  if (!id || !["active", "closed", "archived"].includes(next)) {
    redirect("/umfragen?error=invalid");
  }

  await sql`
    UPDATE surveys
    SET
      status=${next},
      published_at=CASE WHEN ${next}='active' AND published_at IS NULL THEN now() ELSE published_at END,
      closed_at=CASE
        WHEN ${next}='closed' THEN now()
        WHEN ${next}='active' THEN NULL
        ELSE closed_at
      END
    WHERE id=${id}::uuid
  `;

  await writeAudit(actor.id, "survey.status_changed", "survey", id, { status: next });

  revalidatePath("/umfragen");
  revalidatePath(`/umfragen/${id}`);
  redirect(`/umfragen/${id}?status=1`);
}

export async function deleteSurveyAction(formData: FormData) {
  const actor = await requirePermission("surveys.write");
  const sql = getDb();
  if (!sql) redirect("/umfragen?error=database");

  const id = value(formData, "id");
  if (!id) redirect("/umfragen?error=invalid");

  const rows = await sql`
    SELECT title,status,
      (SELECT count(*)::int FROM survey_responses r WHERE r.survey_id=s.id) AS responses
    FROM surveys s
    WHERE id=${id}::uuid
    LIMIT 1
  `;
  const survey = rows[0];
  if (!survey) redirect("/umfragen?error=not_found");

  await writeAudit(actor.id, "survey.deleted", "survey", id, {
    title: String(survey.title),
    status: String(survey.status),
    responses: Number(survey.responses ?? 0),
  });

  await sql`DELETE FROM surveys WHERE id=${id}::uuid`;

  revalidatePath("/umfragen");
  redirect("/umfragen?deleted=1");
}

export async function duplicateSurveyAction(formData: FormData) {
  const actor = await requirePermission("surveys.write");
  const sql = getDb();
  if (!sql) redirect("/umfragen?error=database");

  const id = value(formData, "id");
  if (!id) redirect("/umfragen?error=invalid");

  const sourceRows = await sql`
    SELECT
      title,topic,description,target_group,results_visibility,thank_you_text,
      one_response_per_browser,is_anonymous
    FROM surveys
    WHERE id=${id}::uuid
    LIMIT 1
  `;
  const source = sourceRows[0];
  if (!source) redirect("/umfragen?error=not_found");

  const newRows = await sql`
    INSERT INTO surveys (
      public_token,title,topic,description,target_group,status,
      results_visibility,thank_you_text,one_response_per_browser,is_anonymous,
      created_by_user_id
    )
    VALUES (
      ${surveyToken()},${String(source.title) + " – Kopie"},${source.topic},${source.description},
      ${source.target_group},'draft',${source.results_visibility},${source.thank_you_text},
      ${Boolean(source.one_response_per_browser)},${Boolean(source.is_anonymous)},${actor.id}::uuid
    )
    RETURNING id::text
  `;
  const newId = String(newRows[0].id);

  const identityFields = await sql`
    SELECT position,label,field_type,required
    FROM survey_identity_fields
    WHERE survey_id=${id}::uuid
    ORDER BY position
  `;

  for (const field of identityFields) {
    await sql`
      INSERT INTO survey_identity_fields (
        survey_id,position,label,field_type,required
      )
      VALUES (
        ${newId}::uuid,${field.position},${field.label},${field.field_type},${field.required}
      )
    `;
  }

  const questions = await sql`
    SELECT id::text,position,question_text,question_type,required,max_selections
    FROM survey_questions
    WHERE survey_id=${id}::uuid
    ORDER BY position
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
      SELECT position,label
      FROM survey_options
      WHERE question_id=${question.id}::uuid
      ORDER BY position
    `;

    for (const option of options) {
      await sql`
        INSERT INTO survey_options (question_id,position,label)
        VALUES (${newQuestionId}::uuid,${option.position},${option.label})
      `;
    }
  }

  await writeAudit(actor.id, "survey.duplicated", "survey", newId, { sourceSurveyId: id });

  revalidatePath("/umfragen");
  redirect(`/umfragen/${newId}?duplicated=1`);
}

export async function submitSurveyResponseAction(formData: FormData) {
  const sql = getDb();
  const token = value(formData, "token");
  if (!sql || !token) redirect(`/u/${encodeURIComponent(token)}?error=unavailable`);

  const surveyRows = await sql`
    SELECT
      id::text,status,starts_at,ends_at,one_response_per_browser,is_anonymous
    FROM surveys
    WHERE public_token=${token}
    LIMIT 1
  `;
  const survey = surveyRows[0];

  if (!survey || survey.status !== "active") {
    redirect(`/u/${token}?error=closed`);
  }

  if (survey.one_response_per_browser) {
    const jar = await cookies();
    if (jar.get(`vdc_survey_done_${token}`)?.value === "1") {
      redirect(`/u/${token}?done=1&already=1`);
    }
  }

  const now = Date.now();
  if (survey.starts_at && new Date(String(survey.starts_at)).getTime() > now) {
    redirect(`/u/${token}?error=not_started`);
  }
  if (survey.ends_at && new Date(String(survey.ends_at)).getTime() < now) {
    redirect(`/u/${token}?error=closed`);
  }

  const [questions, options, identityFields] = await Promise.all([
    sql`
      SELECT id::text,question_type,required,max_selections
      FROM survey_questions
      WHERE survey_id=${survey.id}::uuid
      ORDER BY position
    `,
    sql`
      SELECT o.id::text,o.question_id::text
      FROM survey_options o
      JOIN survey_questions q ON q.id=o.question_id
      WHERE q.survey_id=${survey.id}::uuid
    `,
    sql`
      SELECT id::text,label,field_type,required
      FROM survey_identity_fields
      WHERE survey_id=${survey.id}::uuid
      ORDER BY position
    `,
  ]);

  const identityValues: Array<{fieldId:string; value:string}> = [];
  if (!survey.is_anonymous) {
    if (identityFields.length === 0) {
      redirect(`/u/${token}?error=identity`);
    }

    for (const field of identityFields) {
      const fieldId = String(field.id);
      const fieldValue = value(formData, `identity_${fieldId}`);

      if (field.required && !fieldValue) {
        redirect(`/u/${token}?error=required_identity`);
      }
      if (fieldValue.length > 500) {
        redirect(`/u/${token}?error=identity_too_long`);
      }

      if (fieldValue) {
        identityValues.push({ fieldId, value: fieldValue });
      }
    }
  }

  const allowedOptions = new Map<string, Set<string>>();
  for (const option of options) {
    const questionId = String(option.question_id);
    if (!allowedOptions.has(questionId)) allowedOptions.set(questionId, new Set());
    allowedOptions.get(questionId)!.add(String(option.id));
  }

  const validated: Array<{questionId:string; text:string | null; optionIds:string[]}> = [];

  for (const question of questions) {
    const questionId = String(question.id);
    const type = String(question.question_type);
    const field = `q_${questionId}`;

    if (type === "text") {
      const textAnswer = value(formData, field);
      if (question.required && !textAnswer) redirect(`/u/${token}?error=required`);
      if (textAnswer.length > 5000) redirect(`/u/${token}?error=too_long`);
      validated.push({ questionId, text: textAnswer || null, optionIds: [] });
      continue;
    }

    const selected = formData.getAll(field).map(String).filter(Boolean);
    const allowed = allowedOptions.get(questionId) ?? new Set<string>();

    if (selected.some((optionId) => !allowed.has(optionId))) {
      redirect(`/u/${token}?error=invalid`);
    }
    if (type === "single" && selected.length > 1) {
      redirect(`/u/${token}?error=invalid`);
    }
    if (question.required && selected.length === 0) {
      redirect(`/u/${token}?error=required`);
    }

    const maxSelections = Number(question.max_selections ?? 0);
    if (type === "multiple" && maxSelections > 0 && selected.length > maxSelections) {
      redirect(`/u/${token}?error=max`);
    }

    validated.push({ questionId, text: null, optionIds: selected });
  }

  const responseRows = await sql`
    INSERT INTO survey_responses (survey_id)
    VALUES (${survey.id}::uuid)
    RETURNING id::text
  `;
  const responseId = String(responseRows[0].id);

  for (const identity of identityValues) {
    await sql`
      INSERT INTO survey_response_identity_values (response_id,field_id,value)
      VALUES (${responseId}::uuid,${identity.fieldId}::uuid,${identity.value})
    `;
  }

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

  if (survey.one_response_per_browser) {
    const jar = await cookies();
    jar.set(`vdc_survey_done_${token}`, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/u/${token}`,
      maxAge: 60 * 60 * 24 * 180,
    });
  }

  revalidatePath(`/u/${token}`);
  redirect(`/u/${token}?done=1`);
}
