import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/access";
import { primaryRoleLabel } from "@/lib/roles";

export const dynamic = "force-dynamic";

type GuideModule = {
  title: string;
  area: string;
  href: string;
  permission?: Permission;
  description: string;
  capabilities: string[];
};

const modules: GuideModule[] = [
  {
    title: "Dashboard",
    area: "Start",
    href: "/",
    description: "Die persönliche Übersicht zeigt die für deine Rolle wichtigsten Vereinsinformationen.",
    capabilities: ["Offene Aufgaben und Fristen sehen", "Nächste Termine erkennen", "Hinweise und Vereinsaktivität im Blick behalten"],
  },
  {
    title: "Mitglieder",
    area: "Verein",
    href: "/mitglieder",
    permission: "members.read",
    description: "Mitgliederstammdaten, Status, Beiträge, Trainingsaktivität und Benutzerzugänge zusammenführen.",
    capabilities: ["Mitglieder suchen und öffnen", "Mitgliedschaft und Historie nachvollziehen", "Je nach Berechtigung Stammdaten und Rollen pflegen"],
  },
  {
    title: "Vorstand & Rollen",
    area: "Verein",
    href: "/vorstand",
    permission: "members.read",
    description: "Die aktuelle Vereinsstruktur wird automatisch aus den vergebenen Rollen aufgebaut.",
    capabilities: ["Hauptrolle jeder Person sehen", "Weitere Rollen als Vermerk erkennen", "Rollen nach festgelegter Priorität darstellen"],
  },
  {
    title: "Mannschaften & Training",
    area: "Sport",
    href: "/mannschaften",
    permission: "teams.read",
    description: "Mannschaften, Kader, Team Captains und Trainingsinformationen zentral einsehen.",
    capabilities: ["Mannschaftsdaten öffnen", "Kader und Captains sehen", "Training und sportliche Organisation verbinden"],
  },
  {
    title: "Termine",
    area: "Sport",
    href: "/kalender",
    permission: "calendar.read",
    description: "Vereinstermine, Ligaspiele, Training, Sitzungen und Turniere in einer gemeinsamen Kalenderansicht.",
    capabilities: ["Kommende Termine prüfen", "Quellen und Mannschaften unterscheiden", "Mit Schreibrecht eigene Termine anlegen und pflegen"],
  },
  {
    title: "Aufgaben",
    area: "Organisation",
    href: "/aufgaben",
    permission: "tasks.read",
    description: "Vorstands- und Vereinsaufgaben mit Verantwortlichen, Prioritäten und Fristen verwalten.",
    capabilities: ["Offene Aufgaben verfolgen", "Zuständigkeiten erkennen", "Fortschritt und Erledigung dokumentieren"],
  },
  {
    title: "Sitzungen & Beschlüsse",
    area: "Organisation",
    href: "/sitzungen",
    permission: "meetings.read",
    description: "Vorstandssitzungen vorbereiten, durchführen und direkt mit Beschlüssen und Aufgaben verbinden.",
    capabilities: ["Tagesordnung vorbereiten", "Sitzungsmodus nutzen", "Beschlüsse und Folgeaufgaben dokumentieren"],
  },
  {
    title: "Umfragen",
    area: "Organisation",
    href: "/umfragen",
    permission: "surveys.read",
    description: "Anonyme Umfragen mit öffentlichem Link erstellen, per WhatsApp verteilen und zentral auswerten.",
    capabilities: [
      "Einzel-, Mehrfachauswahl und Freitext kombinieren",
      "Entwürfe vor Veröffentlichung vollständig bearbeiten",
      "Anonymen Link und fertigen WhatsApp-Text erzeugen",
      "Optional nur eine Teilnahme pro Browser/Gerät zulassen",
      "Ergebnisse, Prozentwerte und Freitextantworten auswerten",
    ],
  },
  {
    title: "Dokumente & Archiv",
    area: "Organisation",
    href: "/dokumente",
    permission: "documents.read",
    description: "Vereinsunterlagen zentral ablegen und mit Sitzungen oder Beschlüssen verknüpfen.",
    capabilities: ["Dokumente finden", "Versionen und Zuordnungen nachvollziehen", "Abgelegte Inhalte im Archiv wiederfinden"],
  },
  {
    title: "Finanzen",
    area: "Verein",
    href: "/finanzen",
    permission: "finance.read",
    description: "Finanzbewegungen, Beiträge und vereinsbezogene Finanzinformationen übersichtlich verwalten.",
    capabilities: ["Einnahmen und Ausgaben prüfen", "Mitgliedsbeiträge verfolgen", "Finanzstatus für die Vorstandsarbeit nutzen"],
  },
  {
    title: "Sponsoren",
    area: "Verein",
    href: "/sponsoren",
    permission: "sponsors.read",
    description: "Partner, Laufzeiten, Leistungen und Ansprechpartner an einer Stelle pflegen.",
    capabilities: ["Aktive Sponsoren sehen", "Vertragsinformationen verfolgen", "Leistungen und Gegenleistungen dokumentieren"],
  },
  {
    title: "Statistiken",
    area: "Sport",
    href: "/statistik",
    permission: "statistics.read",
    description: "Aktivität aus Liga, Turnier und Training für den Verein zusammenfassen.",
    capabilities: ["Mannschaftsaktivität prüfen", "Trainingsentwicklung betrachten", "Importierte Fachsystemdaten auswerten"],
  },
  {
    title: "Administration",
    area: "EDV",
    href: "/admin",
    permission: "settings.manage",
    description: "Technische Verwaltung für EDV-Wart bzw. Administratoren.",
    capabilities: ["Benutzer und Rollen verwalten", "Integrationen und Systemstatus prüfen", "Audit-Log, Datenqualität und Papierkorb verwalten"],
  },
];

export default async function GuidePage() {
  const user = await requireUser();
  const primaryRole = primaryRoleLabel(user.roles);

  return (
    <div className="page-stack">
      <section className="page-heading guide-heading">
        <div>
          <span className="eyebrow">Hilfe & Orientierung</span>
          <h1>Anleitung</h1>
          <p>Hier findest du, was VDC Club kann und welche Bereiche je nach Rolle für dich freigeschaltet sind.</p>
        </div>
        <div className="guide-role-card">
          <span>Deine Hauptrolle</span>
          <strong>{primaryRole}</strong>
          <small>Mehrere Rollen ergänzen ihre Berechtigungen gegenseitig.</small>
        </div>
      </section>

      <article className="panel guide-intro">
        <div>
          <span className="eyebrow">So funktioniert VDC Club</span>
          <h2>Eine Zentrale für die Vereinsarbeit</h2>
          <p>
            VDC Club bündelt Vorstand, Mitglieder, Mannschaften, Training, Termine, Aufgaben,
            Sitzungen, Beschlüsse, Dokumente, Finanzen und die Daten aus den angebundenen VDC-Systemen.
            Welche Funktionen du bearbeiten kannst, richtet sich nach deinen Rollen.
          </p>
        </div>
        <div className="guide-flow">
          <span>VDC-TC</span><b>→</b><span>VDC Club</span><b>←</b><span>Training / Turnier</span>
        </div>
      </article>

      <section className="guide-grid">
        {modules.map((module) => {
          const available = !module.permission || hasPermission(user.roles, module.permission);
          return (
            <article className="guide-card" key={module.title}>
              <div className="guide-card-head">
                <div>
                  <span>{module.area}</span>
                  <h2>{module.title}</h2>
                </div>
                <b className={available ? "guide-access-yes" : "guide-access-no"}>
                  {available ? "Für dich verfügbar" : "Rollenabhängig"}
                </b>
              </div>
              <p>{module.description}</p>
              <div className="guide-capabilities">
                {module.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
              </div>
              {available ? (
                <Link href={module.href} className="ghost-button">Bereich öffnen</Link>
              ) : (
                <small className="guide-access-note">Für diesen Bereich brauchst du eine passende Rolle.</small>
              )}
            </article>
          );
        })}
      </section>

      <article className="panel guide-survey-workflow">
        <div className="panel-head">
          <div><span className="eyebrow">Umfragen</span><h2>So läuft eine Umfrage ab</h2></div>
          <Link href="/umfragen" className="ghost-button">Umfragen öffnen</Link>
        </div>
        <div className="guide-workflow-steps">
          <div><b>1</b><span><strong>Erstellen</strong><small>Titel, Thema, Zielgruppe, Frist und Fragen festlegen.</small></span></div>
          <div><b>2</b><span><strong>Entwurf prüfen</strong><small>Fragen, Antwortarten und Einstellungen können vor Veröffentlichung noch geändert werden.</small></span></div>
          <div><b>3</b><span><strong>Veröffentlichen</strong><small>Der öffentliche anonyme Link wird freigeschaltet. Optional kann pro Browser nur eine Teilnahme erlaubt werden.</small></span></div>
          <div><b>4</b><span><strong>Teilen</strong><small>Link oder automatisch erstellten WhatsApp-Text kopieren und an die Zielgruppe senden.</small></span></div>
          <div><b>5</b><span><strong>Auswerten</strong><small>Teilnahmen, Auswahlwerte, Prozentangaben und anonyme Freitextantworten ansehen.</small></span></div>
        </div>
        <div className="survey-anonymous-note">
          <strong>Anonymität</strong>
          <span>Antworten werden ohne Namen, Mitglied, Benutzerkonto, E-Mail-Adresse oder IP-Adresse gespeichert. Der optionale Mehrfachschutz verwendet nur ein Cookie im jeweiligen Browser.</span>
        </div>
      </article>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Rollenprinzip</span><h2>Mehrere Rollen sind möglich</h2></div>
        </div>
        <p className="guide-footer-copy">
          Eine Person kann mehrere Rollen gleichzeitig haben. In der Vorstandsstruktur wird nur die
          höchste Rolle der festgelegten Reihenfolge als Hauptrolle angezeigt; alle weiteren Rollen
          stehen direkt darunter als Zusatzrollen. Die Berechtigungen aller zugewiesenen Rollen bleiben aktiv.
        </p>
      </article>
    </div>
  );
}
