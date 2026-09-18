import Link from "next/link";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sql = getDb();

  const [users, integrations, errors, audit] = sql
    ? await Promise.all([
        sql`SELECT count(*)::int AS count FROM app_users WHERE status='active'`,
        sql`SELECT count(*)::int AS count FROM integration_connections WHERE status='connected'`,
        sql`SELECT count(*)::int AS count FROM integration_connections WHERE status='error'`,
        sql`SELECT count(*)::int AS count FROM audit_log WHERE created_at >= now() - interval '7 days'`,
      ])
    : [[{ count:0 }],[{ count:0 }],[{ count:0 }],[{ count:0 }]];

  const cards = [
    {
      href:"/admin/benutzer",
      short:"BR",
      title:"Benutzer & Rollen",
      text:"Logins, Rollen, Zugriffsstatus und Berechtigungen verwalten.",
      meta:`${Number(users[0]?.count ?? 0)} aktive Benutzer`,
    },
    {
      href:"/admin/integrationen",
      short:"IN",
      title:"Integrationen",
      text:"VDC-TC, Turnier und Training überwachen und steuern.",
      meta:`${Number(integrations[0]?.count ?? 0)}/3 verbunden`,
    },
    {
      href:"/admin/status",
      short:"SY",
      title:"Systemstatus",
      text:"Datenbank, Umgebungsvariablen und technische Systemgesundheit prüfen.",
      meta:Number(errors[0]?.count ?? 0) ? `${Number(errors[0]?.count)} Fehler` : "Keine Integrationsfehler",
    },
    {
      href:"/admin/audit",
      short:"AL",
      title:"Audit-Log",
      text:"Administrative Änderungen und sicherheitsrelevante Aktionen nachvollziehen.",
      meta:`${Number(audit[0]?.count ?? 0)} Einträge in 7 Tagen`,
    },
  ];

  return (
    <div className="page-stack">
      <section className="page-heading admin-heading">
        <div>
          <span className="eyebrow">Nur Administratoren</span>
          <h1>Administration</h1>
          <p>Technik, Benutzerrechte und Systemüberwachung sind bewusst von der normalen Vereinsarbeit getrennt.</p>
        </div>
        <span className="admin-lock-chip">ADMIN</span>
      </section>

      <section className="admin-launch-grid">
        {cards.map((card) => (
          <Link href={card.href} className="admin-launch-card" key={card.href}>
            <div className="admin-launch-icon">{card.short}</div>
            <div>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
              <span>{card.meta}</span>
            </div>
            <b>›</b>
          </Link>
        ))}
      </section>

      <article className="panel admin-info-panel">
        <div className="panel-head">
          <div><span className="eyebrow">Trennung</span><h2>Was normale Nutzer nicht sehen</h2></div>
        </div>
        <div className="admin-hidden-grid">
          <div><strong>Datenbank</strong><span>Verbindungsstatus, technische Tabellen und Konfiguration.</span></div>
          <div><strong>API & Tokens</strong><span>Umgebungsvariablen, Push-Endpunkte und Sync-Konfiguration.</span></div>
          <div><strong>Systemfehler</strong><span>Integrationsfehler und technische Diagnosen.</span></div>
          <div><strong>Rechteverwaltung</strong><span>Adminrollen, Benutzerstatus und Zugriffskontrolle.</span></div>
        </div>
      </article>
    </div>
  );
}
