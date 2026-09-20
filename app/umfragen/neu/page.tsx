import Link from "next/link";
import { requirePermission } from "@/lib/permissions";
import { SurveyBuilder } from "@/components/survey-builder";

export const dynamic = "force-dynamic";

const errors: Record<string,string> = {
  database: "Die Datenbank ist nicht verfügbar.",
  missing: "Titel und Thema sind erforderlich.",
  invalid_questions: "Bitte mindestens eine gültige Frage anlegen.",
  invalid_options: "Auswahlfragen benötigen mindestens zwei Antwortmöglichkeiten.",
  invalid_identity_fields: "Bei einer nicht anonymen Umfrage muss mindestens ein gültiges Teilnehmerfeld vorhanden sein.",
  duplicate_identity_fields: "Teilnehmerfelder dürfen nicht dieselbe Bezeichnung haben.",
};

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{error?:string}>;
}) {
  await requirePermission("surveys.write");
  const params = await searchParams;

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <Link href="/umfragen" className="back-link">← Umfragen</Link>
          <span className="eyebrow">Umfrage-Builder</span>
          <h1>Neue Umfrage erstellen</h1>
          <p>Fragen kombinieren und festlegen, ob die Teilnahme anonym oder mit frei definierten Teilnehmerangaben erfolgt.</p>
        </div>
      </section>

      {params.error && <div className="form-error">{errors[params.error] ?? "Die Umfrage konnte nicht gespeichert werden."}</div>}
      <SurveyBuilder />
    </div>
  );
}
