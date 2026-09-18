import { redirect } from "next/navigation";
import { getCurrentUser, hasAdminAccount } from "@/lib/auth";
import { loginAction } from "@/app/auth/actions";

const messages: Record<string, string> = {
  database: "Die Datenbankverbindung ist noch nicht eingerichtet.",
  missing: "Bitte E-Mail und Passwort eingeben.",
  invalid: "E-Mail oder Passwort ist nicht korrekt.",
  locked: "Der Zugang ist vorübergehend gesperrt. Bitte später erneut versuchen.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const hasAdmin = await hasAdminAccount();
  if (!hasAdmin) redirect("/setup");

  const params = await searchParams;
  const message = params.error ? messages[params.error] : null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark" aria-hidden="true"><span>VDC</span><i /></div>
          <div className="brand-copy"><strong>Vestischer Dart Club</strong><span>e.V. · Vorstandsportal</span></div>
        </div>
        <div className="auth-copy">
          <span className="eyebrow">Anmeldung</span>
          <h1>Willkommen zurück</h1>
          <p>Melde dich mit deinem VDC-Club-Konto an.</p>
        </div>
        {message && <div className="form-error">{message}</div>}
        <form action={loginAction} className="form-stack">
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <label>E-Mail<input name="email" type="email" autoComplete="email" required /></label>
          <label>Passwort<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="primary-button" type="submit">Anmelden</button>
        </form>
      </section>
    </main>
  );
}
