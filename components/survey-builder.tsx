"use client";

import { useMemo, useState } from "react";
import { createSurveyAction } from "@/app/umfragen/actions";

type QuestionType = "single" | "multiple" | "text";
type Question = {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  maxSelections: number | null;
  options: string[];
};

function makeQuestion(type: QuestionType = "single"): Question {
  return {
    id: crypto.randomUUID(),
    text: "",
    type,
    required: true,
    maxSelections: type === "multiple" ? 2 : null,
    options: type === "text" ? [] : ["", ""],
  };
}

export function SurveyBuilder() {
  const [questions, setQuestions] = useState<Question[]>([makeQuestion()]);
  const payload = useMemo(() => JSON.stringify(questions), [questions]);

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

  return (
    <form action={createSurveyAction} className="survey-builder">
      <input type="hidden" name="questionsJson" value={payload} />

      <section className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Grunddaten</span><h2>Neue Umfrage</h2></div>
        </div>

        <div className="form-grid">
          <label>
            Titel
            <input name="title" required placeholder="z. B. Trainingsgestaltung 2026" />
          </label>
          <label>
            Thema
            <input name="topic" required placeholder="z. B. Training, Vereinsabend, Anschaffung" />
          </label>
        </div>

        <label>
          Beschreibung / Worum geht es?
          <textarea
            name="description"
            rows={4}
            placeholder="Kurze Erklärung, warum die Umfrage durchgeführt wird und was mit den Ergebnissen passiert."
          />
        </label>

        <div className="form-grid">
          <label>
            Zielgruppe
            <select name="targetGroup" defaultValue="Alle">
              <option>Alle</option>
              <option>Vorstand</option>
              <option>1. Mannschaft</option>
              <option>2. Mannschaft</option>
              <option>Team Captains</option>
              <option>Aktive Spieler</option>
            </select>
          </label>
          <label>
            Teilnahme bis
            <input name="endsAt" type="datetime-local" />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Ergebnisse für Teilnehmer
            <select name="resultsVisibility" defaultValue="internal">
              <option value="internal">Nicht anzeigen</option>
              <option value="after_submit">Nach Abgabe anzeigen</option>
            </select>
          </label>
          <label>
            Danke-Text
            <input name="thankYouText" defaultValue="Vielen Dank für deine Teilnahme." />
          </label>
        </div>

        <label className="checkbox-row survey-publish-check">
          <input type="checkbox" name="publishNow" value="1" />
          <span>Direkt veröffentlichen und Link aktivieren</span>
        </label>
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
                      <button type="button" className="mini-button" onClick={() => removeOption(question.id, optionIndex)}>×</button>
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
          <button type="button" className="ghost-button" onClick={() => setQuestions((current) => [...current, makeQuestion("single")])}>Einzelauswahl</button>
          <button type="button" className="ghost-button" onClick={() => setQuestions((current) => [...current, makeQuestion("multiple")])}>Mehrfachauswahl</button>
          <button type="button" className="ghost-button" onClick={() => setQuestions((current) => [...current, makeQuestion("text")])}>Freitext</button>
        </div>
        <button type="submit" className="primary-button">Umfrage speichern</button>
      </div>
    </form>
  );
}
