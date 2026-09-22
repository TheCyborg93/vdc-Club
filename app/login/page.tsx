import { redirect } from "next/navigation";
import { getCurrentUser, hasAdminAccount } from "@/lib/auth";
import { loginAction } from "@/app/auth/actions";
import {
  AuthSurface,
  authFieldClass,
  authFormClass,
  authInputClass,
  authSubmitClass,
} from "@/components/auth-surface";

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
    <AuthSurface
      eyebrow="Anmeldung"
      title="Willkommen zurück"
      description="Melde dich mit deinem VDC-Club-Konto an."
      message={message}
    >
      <form action={loginAction} className={authFormClass}>
        <input type="hidden" name="next" value={params.next ?? "/"} />
        <label className={authFieldClass}>
          E-Mail
          <input className={authInputClass} name="email" type="email" autoComplete="email" required />
        </label>
        <label className={authFieldClass}>
          Passwort
          <input className={authInputClass} name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className={authSubmitClass} type="submit">Anmelden</button>
      </form>
    </AuthSurface>
  );
}
