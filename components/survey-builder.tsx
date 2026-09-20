"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createSurveyAction,
  updateSurveyDraftAction,
} from "@/app/umfragen/actions";

type QuestionType = "single" | "multiple" | "text";
type Question = {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  maxSelections: number | null;
  options: string[];
};

type SurveyBuilderInitial = {
  title: string;
  topic: string;
  description: string;
  targetGroup: string;
  endsAtLocal: string;
  resultsVisibility: "internal" | "after_submit";
  thankYouText: string;
  oneResponsePerBrowser: boolean;
  questions: Array<Omit<Question, "id"> & { id?: string }>;
};

function blankQuestion(type: QuestionType = "single", id = "initial-1"): Question {
  return {
    id,
    text: "",
    type,
    required: true,
    maxSelections: type === "multiple" ? 2 : null,
    options: type === "text" ? [] : ["", ""],
  };
}

export function SurveyBuilder({
  mode = "create",
  surveyId,
  initial,
}: {
  mode?: "create" | "edit";
  surveyId?: string;
  initial?: SurveyBuilderInitial;
}) {
  const [questions, setQuestions] = useState<Question[]>(() => {
    if (initial?.questions?.length) {
      return initial.questions.map((question, index) => ({
        ...question,
        id: question.id || `initial-${index + 1}`,
      }));
    }
    return [blankQuestion()];
  });
  const [timezoneOffset, setTimezoneOffset] = useState(0);

  useEffect(() => {
    setTimezoneOffset(new Date().getTimezoneOffset());
  }, []);

  const payload = useMemo(() => JSON.stringify(questions), [questions]);
  const action = mode === "edit" ? updateSurveyDraftAction : createSurveyAction;

  function patchQuestion(id: string, patch: Partial<Question>) {
    setQuestions((current) =>
      current.map((question) => {
        if (question.id !== id) return question;
        const next = { ...question, ...patch };
        if (patch.type === "text") {
          next.options = [];
          next.maxSelections = null;
        } else if (patch.type && question.type === "text") {
          next.options = ["", ""];
          next.maxSelections = patch.type === "multiple" ? 2 : null;
        } else if (patch.type === "single") {
          next.maxSelections = null;
        }
        return next;
      }),
    );
  }

  function patchOption(questionId: string, index: number, value: string) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: question.options.map((option, optionIndex) =>
                optionIndex === index ? value : option,
              ),
            }
          : question,
      ),
    );
  }

  function addOption(questionId: string) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? { ...question, options: [...question.options, ""] }
          : question,
      ),
    );
  }

  function removeOption(questionId: string, index: number) {
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: question.options.filter((_, optionIndex) => optionIndex !== index),
            }
          : question,
      ),
    );
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  function addQuestion(type: QuestionType) {
    setQuestions((current) => [
      ...current,
      blankQuestion(type, crypto.randomUUID()),
    ]);
  }

  return (
    <form action={action} className="survey-builder">
      <input type="hidden" name="questionsJson" value={payload} />
      <input type="hidden" name="timezoneOffset" value={timezoneOffset} />
      {mode === "edit" && surveyId && <input type="hidden" name="surveyId" value={surveyId} />}

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Grunddaten</span>
            <h2>{mode === "edit" ? "Entwurf bearbeiten" : "Neue Umfrage"}</h2>
          </div>
        </div>

        <div className="form-grid">
          <label>
            Titel
            <input
              name="title"
              required
              defaultValue={initial?.title ?? ""}
              placeholder="z. B. Trainingsgestaltung 2026"
            />
          </label>
          <label>
            Thema
            <input
              name="topic"
              required
              defaultValue={initial?.topic ?? ""}
              placeholder="z. B. Training, Vereinsabend, Anschaffung"
            />
          </label>
        </div>

        <label>
          Beschreibung / Worum geht es?
          <textarea
            name="description"
            rows={4}
            defaultValue={initial?.description ?? ""}
            placeholder="Kurze Erklärung, warum die Umfrage durchgeführt wird und was mit den Ergebnissen passiert."
          />
        </label>

        <div className="form-grid">
          <label>
            Zielgruppe
            <input
              name="targetGroup"
              defaultValue={initial?.targetGroup ?? "Alle"}
              list="survey-target-groups"
              placeholder="z. B. Alle oder eigene Gruppe"
            />
            <datalist id="survey-target-groups">
              <option value="Alle" />
              <option value="Vorstand" />
              <option value="1. Mannschaft" />
              <option value="2. Mannschaft" />
              <option value="Team Captains" />
              <option value="Aktive Spieler" />
            </datalist>
          </label>
          <label>
            Teilnahme bis
            <input
              name="endsAt"
              type="datetime-local"
              defaultValue={initial?.endsAtLocal ?? ""}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Ergebnisse für Teilnehmer
            <select
              name="resultsVisibility"
              defaultValue={initial?.resultsVisibility ?? "internal"}
            >
              <option value="internal">Nicht anzeigen</option>
              <option value="after_submit">Nach Abgabe anzeigen</option>
            </select>
          </label>
          <label>
            Danke-Text
            <input
              name="thankYouText"
              defaultValue={initial?.thankYouText ?? "Vielen Dank für deine Teilnahme."}
            />
          </label>
        </div>

        <div className="survey-settings-box">
          <label className="checkbox-row survey-publish-check">
            <input
              type="checkbox"
              name="oneResponsePerBrowser"
              value="1"
              defaultChecked={initial?.oneResponsePerBrowser ?? false}
            />
            <span>
              <strong>Nur eine Teilnahme pro Browser/Gerät</strong>
              <small>
                Nach dem Absenden merkt sich nur der Browser die Teilnahme per Cookie.
                Es werden dafür keine Namen, Konten, E-Mails oder IP-Adressen gespeichert.
              </small>
            </span>
          </label>

          <label className="checkbox-row survey-publish-check">
            <input type="checkbox" name="publishNow" value="1" />
            <span>
              <strong>{mode === "edit" ? "Änderungen speichern und veröffentlichen" : "Direkt veröffentlichen"}</strong>
              <small>Der öffentliche Link wird anschließend für die Teilnahme freigeschaltet.</small>
            </span>
          </label>
        </div>
      </section>

      <section className="survey-question-stack">
        {questions.map((question, index) => (
          <article className="panel survey-question-card" key={question.id}>
            <div className="survey-question-head">
              <div>
                <span className="eyebrow">Frage {index + 1}</span>
                <h2>{question.text.trim() || "Neue Frage"}</h2>
              </div>
              <div className="survey-question-actions">
                <button type="button" className="mini-button" onClick={() => moveQuestion(index, -1)} disabled={index === 0}>↑</button>
                <button type="button" className="mini-button" onClick={() => moveQuestion(index, 1)} disabled={index === questions.length - 1}>↓</button>
                {questions.length > 1 && (
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}
                  >
                    Entfernen
                  </button>
                )}
              </div>
            </div>

            <label>
              Frage
              <input
                value={question.text}
                onChange={(event) => patchQuestion(question.id, { text: event.target.value })}
                placeholder="Was möchtest du wissen?"
                required
              />
            </label>

            <div className="form-grid">
              <label>
                Antwortart
                <select
                  value={question.type}
                  onChange={(event) => patchQuestion(question.id, { type: event.target.value as QuestionType })}
                >
                  <option value="single">Eine Antwort auswählbar</option>
                  <option value="multiple">Mehrere Antworten auswählbar</option>
                  <option value="text">Freitext</option>
                </select>
              </label>

              {question.type === "multiple" ? (
                <label>
                  Max. auswählbar
                  <input
                    type="number"
                    min={1}
                    value={question.maxSelections ?? ""}
                    onChange={(event) =>
                      patchQuestion(question.id, {
                        maxSelections: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </label>
              ) : (
                <label className="checkbox-row survey-required-check">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) => patchQuestion(question.id, { required: event.target.checked })}
                  />
                  <span>Antwort ist Pflicht</span>
                </label>
              )}
            </div>

            {question.type === "multiple" && (
              <label className="checkbox-row survey-required-check">
                <input
                  type="checkbox"
                  checked={question.required}
                  onChange={(event) => patchQuestion(question.id, { required: event.target.checked })}
                />
                <span>Antwort ist Pflicht</span>
              </label>
            )}

            {question.type !== "text" && (
              <div className="survey-option-editor">
                <span>Antwortmöglichkeiten</span>
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex}>
                    <input
                      value={option}
                      onChange={(event) => patchOption(question.id, optionIndex, event.target.value)}
                      placeholder={`Antwort ${optionIndex + 1}`}
                      required
                    />
                    {question.options.length > 2 && (
                      <button
                        type="button"
                        className="mini-button"
                        onClick={() => removeOption(question.id, optionIndex)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="ghost-button" onClick={() => addOption(question.id)}>
                  + Antwort hinzufügen
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      <div className="survey-builder-footer">
        <div className="survey-add-question">
          <span>Weitere Frage hinzufügen:</span>
          <button type="button" className="ghost-button" onClick={() => addQuestion("single")}>Einzelauswahl</button>
          <button type="button" className="ghost-button" onClick={() => addQuestion("multiple")}>Mehrfachauswahl</button>
          <button type="button" className="ghost-button" onClick={() => addQuestion("text")}>Freitext</button>
        </div>
        <button type="submit" className="primary-button">
          {mode === "edit" ? "Änderungen speichern" : "Umfrage speichern"}
        </button>
      </div>
    </form>
  );
}
