import { redirect } from "next/navigation";
import { getCurrentUser, hasAdminAccount } from "@/lib/auth";
import { setupAdminAction } from "@/app/auth/actions";

const messages: Record<string, string> = {
  database: "Die Datenbankverbindung ist noch nicht eingerichtet.",
  missing: "Bitte alle Pflichtfelder ausfüllen.",
  confirm: "Die beiden Passwörter stimmen nicht überein.",
  password: "Das Passwort muss mindestens 12 Zeichen lang sein.",
  exists: "Für diese E-Mail existiert bereits ein Datensatz.",
  unknown: "Der Administrator konnte nicht angelegt werden.",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  if (await hasAdminAccount()) redirect("/login");

  const params = await searchParams;
  const message = params.error ? messages[params.error] : null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">VDC</div>
          <div><strong>VDC Club</strong><span>Ersteinrichtung</span></div>
        </div>
        <div className="auth-copy">
          <span className="eyebrow">Einmalige Einrichtung</span>
          <h1>Ersten Administrator anlegen</h1>
          <p>Dieser Schritt ist nur möglich, solange noch kein Administrator existiert.</p>
        </div>
        {message && <div className="form-error">{message}</div>}
        <form action={setupAdminAction} className="form-stack">
          <div className="form-grid">
            <label>Vorname<input name="firstName" required autoComplete="given-name" /></label>
            <label>Nachname<input name="lastName" required autoComplete="family-name" /></label>
          </div>
          <label>E-Mail<input name="email" type="email" required autoComplete="email" /></label>
          <label>Passwort<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label>
          <label>Passwort wiederholen<input name="confirm" type="password" minLength={12} required autoComplete="new-password" /></label>
          <button className="primary-button" type="submit">Administrator erstellen</button>
        </form>
      </section>
    </main>
  );
}
