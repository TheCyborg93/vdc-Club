import { redirect } from "next/navigation";
import { getCurrentUser, hasAdminAccount } from "@/lib/auth";
import { setupAdminAction } from "@/app/auth/actions";
import {
  AuthSurface,
  authFieldClass,
  authFormClass,
  authGridClass,
  authInputClass,
  authSubmitClass,
} from "@/components/auth-surface";

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
    <AuthSurface
      eyebrow="Einmalige Einrichtung"
      title="Ersten Administrator anlegen"
      description="Dieser Schritt ist nur möglich, solange noch kein Administrator existiert."
      message={message}
    >
      <form action={setupAdminAction} className={authFormClass}>
        <div className={authGridClass}>
          <label className={authFieldClass}>
            Vorname
            <input className={authInputClass} name="firstName" required autoComplete="given-name" />
          </label>
          <label className={authFieldClass}>
            Nachname
            <input className={authInputClass} name="lastName" required autoComplete="family-name" />
          </label>
        </div>
        <label className={authFieldClass}>
          E-Mail
          <input className={authInputClass} name="email" type="email" required autoComplete="email" />
        </label>
        <label className={authFieldClass}>
          Passwort
          <input className={authInputClass} name="password" type="password" minLength={12} required autoComplete="new-password" />
        </label>
        <label className={authFieldClass}>
          Passwort wiederholen
          <input className={authInputClass} name="confirm" type="password" minLength={12} required autoComplete="new-password" />
        </label>
        <button className={authSubmitClass} type="submit">Administrator erstellen</button>
      </form>
    </AuthSurface>
  );
}
