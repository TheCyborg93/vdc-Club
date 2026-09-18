import Link from "next/link";
import { getDashboardData } from "@/lib/dashboard-data";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/access";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Ohne Frist";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function formatEventDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "--", month: "---", time: "" };
  const day = new Intl.DateTimeFormat("de-DE", { day: "2-digit", timeZone: "Europe/Berlin" }).format(date);
  const month = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "Europe/Berlin" }).format(date).replace(".", "").toUpperCase();
  const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(date);
  return { day, month, time };
}

function formatSync(value: string | null) {
  if (!value) return "Noch nie";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Noch nie";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function visibleNavigationAccess(href: string, roles: string[]) {
  const requirements: Record<string, Parameters<typeof hasPermission>[1]> = {
    "/admin/daten":"settings.manage",
    "/admin/integrationen":"settings.manage",
    "/admin/benutzer":"settings.manage",
    "/finanzen":"finance.read",
    "/mitglieder":"members.read",
    "/dokumente":"documents.read",
    "/sitzungen":"meetings.read",
    "/beschluesse":"resolutions.read",
    "/aufgaben":"tasks.read",
    "/mannschaften":"teams.read",
    "/training":"training.read",
    "/statistik":"statistics.read",
    "/kalender":"calendar.read",
  };
  const permission=requirements[href];
  return permission ? hasPermission(roles,permission) : true;
}

const eventTypeLabels: Record<string,string> = {
  league: "Ligaspiel",
  training: "Training",
  tournament: "Turnier",
  board: "Vorstand",
  club: "Verein",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.roles.includes("admin");
  const canTraining = hasPermission(user.roles,"training.read");
  const canTrainingWrite = hasPermission(user.roles,"training.write");
  const data = await getDashboardData({
    includeSystem: isAdmin,
    includeTraining: canTraining,
    memberId: user.memberId,
  });
  const canTasks = hasPermission(user.roles,"tasks.read");
  const canTeams = hasPermission(user.roles,"teams.read");
  const canCalendar = hasPermission(user.roles,"calendar.read");
  const canStatistics = hasPermission(user.roles,"statistics.read");
  const canMeetings = hasPermission(user.roles,"meetings.read");
  const canFinance = hasPermission(user.roles,"finance.read");
  const canSponsors = hasPermission(user.roles,"sponsors.read");
  const canDocuments = hasPermission(user.roles,"documents.read");
  const canMembers = hasPermission(user.roles,"members.read");

  const alerts = data.alerts.filter((alert) => {
    if (alert.kind === "fee") return canFinance;
    if (alert.kind === "task") return canTasks;
    if (alert.kind === "sponsor") return canSponsors;
    if (alert.kind === "document") return canDocuments;
    if (alert.kind === "member_leave" || alert.kind === "member_notice") return canMembers;
    if (alert.kind === "integration") return isAdmin;
    return false;
  });

  const now = new Date();
  const today = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(now);

  const primaryRole =
    user.roles.includes("admin") ? "admin" :
    user.roles.includes("chair") ? "chair" :
    user.roles.includes("vice_chair") ? "vice_chair" :
    user.roles.includes("treasurer") ? "treasurer" :
    user.roles.includes("secretary") ? "secretary" :
    user.roles.includes("sport_director") ? "sport_director" :
    user.roles.includes("team_captain") ? "team_captain" :
    user.roles.includes("tournament_director") ? "tournament_director" :
    user.roles.includes("board") ? "board" : "member";

  const roleFocus: Record<string,{ label:string; text:string; links:{ href:string; label:string }[] }> = {
    admin:{
      label:"Administration",
      text:"System, Datenqualität und Benutzerverwaltung im Blick behalten.",
      links:[
        {href:"/admin/daten",label:"Daten & Qualität"},
        {href:"/admin/integrationen",label:"Integrationen"},
        {href:"/admin/benutzer",label:"Benutzer & Rollen"},
      ],
    },
    chair:{
      label:"Vorsitz",
      text:"Vorstandsarbeit, Beschlüsse und offene Aufgaben steuern.",
      links:[
        {href:"/sitzungen",label:"Sitzungen"},
        {href:"/beschluesse",label:"Beschlüsse"},
        {href:"/aufgaben",label:"Aufgaben"},
      ],
    },
    vice_chair:{
      label:"Stellv. Vorsitz",
      text:"Organisation, Sitzungen und Vereinsaufgaben koordinieren.",
      links:[
        {href:"/sitzungen",label:"Sitzungen"},
        {href:"/aufgaben",label:"Aufgaben"},
        {href:"/mitglieder",label:"Mitglieder"},
      ],
    },
    treasurer:{
      label:"Kasse",
      text:"Beiträge, Buchungen und finanzielle Fristen stehen im Mittelpunkt.",
      links:[
        {href:"/finanzen",label:"Finanzen & Beiträge"},
        {href:"/mitglieder",label:"Mitglieder"},
        {href:"/dokumente",label:"Belege & Dokumente"},
      ],
    },
    secretary:{
      label:"Schriftführung",
      text:"Sitzungen, Protokolle, Beschlüsse und Dokumente zentral bearbeiten.",
      links:[
        {href:"/sitzungen",label:"Sitzungen"},
        {href:"/beschluesse",label:"Beschlüsse"},
        {href:"/dokumente",label:"Dokumente"},
      ],
    },
    sport_director:{
      label:"Sportwart",
      text:"Mannschaften, Training und sportliche Entwicklung im Überblick.",
      links:[
        {href:"/mannschaften",label:"Mannschaften"},
        {href:"/training",label:"Training"},
        {href:"/statistik",label:"Statistik"},
      ],
    },
    team_captain:{
      label:"Team Captain",
      text:"Mannschaft, kommende Termine und Trainingsaktivität schnell erreichen.",
      links:[
        {href:"/mannschaften",label:"Mannschaft"},
        {href:"/kalender",label:"Kalender"},
        {href:"/training",label:"Training"},
      ],
    },
    tournament_director:{
      label:"Turnierleitung",
      text:"Turniertermine, Aufgaben und notwendige Vereinsunterlagen im Zugriff.",
      links:[
        {href:"/kalender",label:"Kalender"},
        {href:"/aufgaben",label:"Aufgaben"},
        {href:"/dokumente",label:"Dokumente"},
      ],
    },
    board:{
      label:"Vorstand",
      text:"Aufgaben, Sitzungen und Vereinsunterlagen für die Vorstandsarbeit.",
      links:[
        {href:"/aufgaben",label:"Aufgaben"},
        {href:"/sitzungen",label:"Sitzungen"},
        {href:"/dokumente",label:"Dokumente"},
      ],
    },
    member:{
      label:"Vereinszugang",
      text:"Deine freigegebenen Vereinsbereiche auf einen Blick.",
      links:[
        {href:"/kalender",label:"Kalender"},
      ],
    },
  };

  const focus=roleFocus[primaryRole];

  const stats = [
    canMembers ? { label: "Mitglieder", value: String(data.members), note: "aktive Mitglieder" } : null,
    canTeams ? { label: "Mannschaften", value: String(data.teams), note: "aktive Teams" } : null,
    canTasks ? { label: "Offene Aufgaben", value: String(data.openTasks), note: "noch zu erledigen" } : null,
    canCalendar ? { label: "Nächste Termine", value: String(data.upcomingEvents), note: "in den nächsten 14 Tagen" } : null,
  ].filter((item): item is { label:string; value:string; note:string } => Boolean(item));

  return (
    <div className="page-stack">
      <section className="hero">
        <div>
          <span className="eyebrow">{today}</span>
          <h1>Vereinszentrale</h1>
          <p>Vorstand, Mannschaften, Training, Turniere, Termine und Finanzen laufen hier in einer gemeinsamen Vereinsansicht zusammen.</p>
        </div>
        <div className="hero-badge">
          <span>VDC</span>
          <strong>Club Control</strong>
          <small>{isAdmin ? `${data.connectedIntegrations}/3 Fachsysteme verbunden` : "Saison 2026/27"}</small>
        </div>
      </section>

      <section className="role-focus-strip">
        <div>
          <span className="eyebrow">Dein Bereich</span>
          <strong>{focus.label}</strong>
          <p>{focus.text}</p>
        </div>
        <nav>
          {focus.links
            .filter((item)=>visibleNavigationAccess(item.href,user.roles))
            .map((item)=>(
              <Link key={item.href} href={item.href}>{item.label}<span>›</span></Link>
            ))}
        </nav>
      </section>

      <section className="stat-grid">
        {stats.map((item) => (
          <article className="stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>

      {isAdmin && (
        <section className="source-health-strip">
          {data.integrations.map((integration) => (
            <article key={integration.key}>
              <div>
                <span className={`sync-run-dot sync-run-${integration.status === "connected" ? "success" : integration.status === "error" ? "error" : "partial"}`} />
                <strong>{integration.name}</strong>
              </div>
              <b>{integration.status === "connected" ? "Verbunden" : integration.status}</b>
              <small>Sync {formatSync(integration.lastSyncAt)}</small>
            </article>
          ))}
        </section>
      )}

      <section className="attention-panel">
        <div className="attention-panel-head">
          <div>
            <span className="eyebrow">Fristen & Hinweise</span>
            <h2>Achtung erforderlich</h2>
          </div>
          <span className={`attention-count ${alerts.length ? "has-alerts" : ""}`}>{alerts.length}</span>
        </div>

        {alerts.length === 0 ? (
          <div className="attention-clear">
            <i />
            <div><strong>Keine dringenden Hinweise</strong><span>Für deine Rolle liegen aktuell keine offenen Warnungen oder Fristen vor.</span></div>
          </div>
        ) : (
          <div className="attention-list">
            {alerts.map((alert,index) => (
              <Link
                href={alert.href}
                className={`attention-row attention-${alert.severity}`}
                key={alert.kind + alert.title + index}
              >
                <span className="attention-dot" />
                <div>
                  <strong>{alert.title}</strong>
                  <span>{alert.detail}</span>
                </div>
                <b>Öffnen ›</b>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-grid">
        {canTasks && (
          <article className="panel panel-wide">
            <div className="panel-head">
              <div><span className="eyebrow">Organisation</span><h2>Offene Aufgaben</h2></div>
              <Link className="ghost-button" href="/aufgaben">Alle anzeigen</Link>
            </div>
            <div className="table-list">
              {data.tasks.length === 0 ? (
                <div className="empty-state">Noch keine offenen Aufgaben vorhanden.</div>
              ) : data.tasks.map((task) => (
                <div className="table-row" key={task.title}>
                  <div><strong>{task.title}</strong><span>{task.category}</span></div>
                  <span>{formatDate(task.dueDate)}</span>
                  <span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                </div>
              ))}
            </div>
          </article>
        )}

        {canCalendar && (
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Kalender</span><h2>Nächste Termine</h2></div>
            <Link className="text-link" href="/kalender">Kalender</Link>
          </div>
          <div className="timeline">
            {data.events.length === 0 ? (
              <div className="empty-state">Noch keine kommenden Termine vorhanden.</div>
            ) : data.events.map((event) => {
              const d = formatEventDate(event.startsAt);
              return (
                <div key={event.title + event.startsAt}>
                  <span>{d.day} {d.month}</span>
                  <p>
                    <strong>{event.title}</strong>
                    <small>
                      {event.team ? `${event.team} · ` : ""}
                      {eventTypeLabels[event.eventType] ?? "Vereinstermin"} · {event.location ?? "Ort offen"} · {d.time}
                    </small>
                  </p>
                </div>
              );
            })}
          </div>
        </article>
        )}

        {canStatistics && (
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Sport & Verein</span><h2>Aktivität 2026</h2></div>
            <Link className="text-link" href="/statistik">Statistik</Link>
          </div>
          <div className="activity-kpi-list">
            <div><span>Ligaspiele im Club-Kalender</span><strong>{data.leagueEvents}</strong></div>
            <div><span>Interne Turniere</span><strong>{data.tournamentsYear}</strong></div>
            <div><span>Trainingstage</span><strong>{data.trainingDaysYear}</strong></div>
          </div>
        </article>
        )}

        {canTraining && data.training && (
          <article className="panel training-dashboard-card">
            <div className="panel-head">
              <div><span className="eyebrow">Training</span><h2>Dein Training</h2></div>
              <Link className="text-link" href="/training">Training</Link>
            </div>
            <div className="training-dashboard-next">
              <span>Nächster Termin</span>
              <strong>
                {data.training.nextAt
                  ? new Intl.DateTimeFormat("de-DE",{
                      weekday:"short",day:"2-digit",month:"2-digit",
                      hour:"2-digit",minute:"2-digit",
                      timeZone:"Europe/Berlin",
                    }).format(new Date(data.training.nextAt))
                  : "Kein Termin"}
              </strong>
              <small>Dienstag & Freitag · 19:00 Uhr · Ende offen</small>
            </div>
            {user.memberId && (
              <div className="training-dashboard-personal">
                <div>
                  <span>Aktivität {new Date().getFullYear()}</span>
                  <strong>{data.training.personalRate}%</strong>
                </div>
                <div>
                  <span>Besucht</span>
                  <strong>{data.training.personalAttended}/{data.training.personalRecorded}</strong>
                </div>
              </div>
            )}
            {canTrainingWrite && data.training.pendingAttendance > 0 && (
              <Link href="/training" className="training-dashboard-alert">
                <span>Anwesenheit offen</span>
                <strong>{data.training.pendingAttendance} Trainingstage prüfen ›</strong>
              </Link>
            )}
          </article>
        )}

        {(canMembers || canTeams || canCalendar) && (
          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Verein</span><h2>Auf einen Blick</h2></div></div>
            {canMembers && <div className="team-card"><div><strong>{data.members} Mitglieder</strong><span>aktiver Vereinsbestand</span></div><b>VDC</b></div>}
            {canTeams && <div className="team-card"><div><strong>{data.teams} Mannschaften</strong><span>im aktuellen Spielbetrieb</span></div><b>SPORT</b></div>}
            {canCalendar && <div className="team-card"><div><strong>{data.upcomingEvents} Termine</strong><span>in den nächsten 14 Tagen</span></div><b>PLAN</b></div>}
          </article>
        )}

        {canMeetings && (
          <article className="panel panel-accent">
            <span className="eyebrow">Sitzungsmodus</span>
            <h2>Vorstandssitzung vorbereiten</h2>
            <p>Tagesordnung, Beschlüsse und Aufgaben werden direkt miteinander verknüpft.</p>
            <Link className="light-button" href="/sitzungen">Sitzungen öffnen</Link>
          </article>
        )}
      </section>
    </div>
  );
}
