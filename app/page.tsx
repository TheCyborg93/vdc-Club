import Link from "next/link";
import type { CSSProperties } from "react";
import { getDashboardData } from "@/lib/dashboard-data";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/access";
import { updateTaskStatusInlineAction } from "@/app/aufgaben/actions";
import { resolutionStatusLabel,taskStatusLabel } from "@/lib/ui-labels";

export const dynamic = "force-dynamic";

const eventTypeLabels:Record<string,string>={
  league:"Liga",
  training:"Training",
  tournament:"Turnier",
  board:"Vorstand",
  club:"Verein",
};

const priorityLabels:Record<string,string>={
  low:"Niedrig",
  medium:"Mittel",
  high:"Hoch",
  urgent:"Dringend",
};

function formatDate(value:string | null) {
  if (!value) return "Ohne Frist";
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",
    month:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

function formatFullDate(value:string) {
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE",{
    weekday:"short",
    day:"2-digit",
    month:"short",
    year:"numeric",
    timeZone:"Europe/Berlin",
  }).format(date);
}

function formatTime(value:string) {
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE",{
    hour:"2-digit",
    minute:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

function formatSync(value:string | null) {
  if (!value) return "Noch nie";
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return "Noch nie";
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",
    month:"2-digit",
    hour:"2-digit",
    minute:"2-digit",
    timeZone:"Europe/Berlin",
  }).format(date);
}

function daysUntil(value:string) {
  const target=new Date(value).getTime();
  const now=Date.now();
  if (!Number.isFinite(target)) return "";
  const days=Math.ceil((target-now)/(1000*60*60*24));
  if (days<=0) return "Heute";
  if (days===1) return "Morgen";
  return "In "+days+" Tagen";
}

export default async function DashboardPage() {
  const user=await requireUser();

  const isAdmin=user.roles.includes("admin");
  const canTasks=hasPermission(user.roles,"tasks.read");
  const canTasksWrite=hasPermission(user.roles,"tasks.write");
  const canCalendar=hasPermission(user.roles,"calendar.read");
  const canCalendarWrite=hasPermission(user.roles,"calendar.write");
  const canTraining=hasPermission(user.roles,"training.read");
  const canTrainingWrite=hasPermission(user.roles,"training.write");
  const canMeetings=hasPermission(user.roles,"meetings.read");
  const canMeetingsWrite=hasPermission(user.roles,"meetings.write");
  const canResolutions=hasPermission(user.roles,"resolutions.read");
  const canResolutionsWrite=hasPermission(user.roles,"resolutions.write");
  const canDocuments=hasPermission(user.roles,"documents.read");
  const canDocumentsWrite=hasPermission(user.roles,"documents.write");
  const canMembersWrite=hasPermission(user.roles,"members.write");

  const primaryRole=
    user.roles.includes("admin") ? "admin" :
    user.roles.includes("chair") ? "chair" :
    user.roles.includes("vice_chair") ? "vice_chair" :
    user.roles.includes("treasurer") ? "treasurer" :
    user.roles.includes("secretary") ? "secretary" :
    user.roles.includes("sport_director") ? "sport_director" :
    user.roles.includes("team_captain") ? "team_captain" :
    user.roles.includes("tournament_director") ? "tournament_director" :
    user.roles.includes("board") ? "board" : "member";

  const roleLabels:Record<string,string>={
    admin:"Administration",
    chair:"1. Vorsitz",
    vice_chair:"2. Vorsitz",
    treasurer:"Kasse",
    secretary:"Schriftführung",
    sport_director:"Sportwart",
    team_captain:"Team Captain",
    tournament_director:"Turnierleitung",
    board:"Vorstand",
    member:"Vereinszugang",
  };


  const data=await getDashboardData({
    includeSystem:isAdmin,
    includeTraining:canTraining,
    memberId:user.memberId,
    primaryRole,
  });

  const nextEvent=data.events[0] ?? null;
  const trainingRate=Math.max(0,Math.min(100,data.training?.personalRate ?? 0));

  const today=new Intl.DateTimeFormat("de-DE",{
    weekday:"long",
    day:"2-digit",
    month:"long",
    year:"numeric",
    timeZone:"Europe/Berlin",
  }).format(new Date());

  const quickActions=[
    canTasksWrite ? {href:"/aufgaben",label:"Aufgabe",sub:"anlegen",icon:"✓"} : null,
    canCalendarWrite ? {href:"/kalender",label:"Termin",sub:"anlegen",icon:"▣"} : null,
    canMeetingsWrite ? {href:"/sitzungen",label:"Sitzung",sub:"planen",icon:"◎"} : null,
    canResolutionsWrite ? {href:"/beschluesse",label:"Beschluss",sub:"öffnen",icon:"≡"} : null,
    canDocumentsWrite ? {href:"/dokumente",label:"Dokument",sub:"hochladen",icon:"⇧"} : null,
    canTrainingWrite ? {href:"/training",label:"Training",sub:"verwalten",icon:"↔"} : null,
    canMembersWrite ? {href:"/mitglieder",label:"Mitglied",sub:"verwalten",icon:"+"} : null,
  ].filter((item):item is {href:string;label:string;sub:string;icon:string}=>Boolean(item));

  return (
    <div className="page-stack control-dashboard">
      <section className="control-hero">
        <div className="control-hero-copy">
          <span className="eyebrow">{today}</span>
          <h1>Gemeinsam. Präzise. Stark.</h1>
          <p>Vestischer Dart Club e.V. · Vereinszentrale</p>
        </div>
        <div className="control-hero-role">
          <img src="/vdc-logo.svg" alt="" />
          <div>
            <span>Dein Bereich</span>
            <strong>{roleLabels[primaryRole]}</strong>
          </div>
        </div>
      </section>

      <section className="today-control">
        <div className="today-control-head">
          <div>
            <span className="today-control-icon">◎</span>
            <div>
              <h2>Heute wichtig</h2>
              <p>Aufgaben, Termine und Trainingshinweise auf einen Blick.</p>
            </div>
          </div>
          <span>{today}</span>
        </div>

        <div className="today-control-grid">
          {canTasks && (
            <article className="today-card today-tasks-card">
              <div className="today-card-head">
                <div>
                  <span className="card-icon">✓</span>
                  <strong>{data.openTasks} offene Aufgaben</strong>
                </div>
                <Link href="/aufgaben">Alle anzeigen →</Link>
              </div>

              <div className="dashboard-task-list">
                {data.tasks.length===0 ? (
                  <div className="compact-empty">Keine offenen Aufgaben.</div>
                ) : data.tasks.map((task)=>(
                  <div className="dashboard-task-row" key={task.id}>
                    <div className="dashboard-task-main">
                      <span className={`task-check-dot task-${task.status}`} />
                      <div>
                        <strong>{task.title}</strong>
                        <small>{task.category}</small>
                      </div>
                    </div>
                    <span className="dashboard-task-date">{formatDate(task.dueDate)}</span>
                    <span className={`priority priority-${task.priority}`}>
                      {priorityLabels[task.priority] ?? task.priority}
                    </span>
                    {canTasksWrite ? (
                      <form action={updateTaskStatusInlineAction} className="dashboard-task-status-form">
                        <input type="hidden" name="id" value={task.id} />
                        <select name="status" defaultValue={task.status} aria-label={"Status "+task.title}>
                          <option value="open">Offen</option>
                          <option value="in_progress">In Arbeit</option>
                          <option value="blocked">Blockiert</option>
                          <option value="done">Erledigt</option>
                        </select>
                        <button title="Status speichern">✓</button>
                      </form>
                    ) : (
                      <span className="dashboard-task-status">{taskStatusLabel(task.status)}</span>
                    )}
                  </div>
                ))}
              </div>
            </article>
          )}

          {canCalendar && (
            <article className="today-card next-event-card">
              <div className="today-card-head">
                <div>
                  <span className="card-icon">▣</span>
                  <strong>Nächster Termin</strong>
                </div>
                {nextEvent && <span className="countdown-chip">{daysUntil(nextEvent.startsAt)}</span>}
              </div>

              {nextEvent ? (
                <>
                  <div className={`next-event-main event-accent-${nextEvent.eventType}`}>
                    <span className={`event-type-chip event-type-${nextEvent.eventType}`}>
                      {eventTypeLabels[nextEvent.eventType] ?? "Termin"}
                    </span>
                    <h3>{nextEvent.title}</h3>
                    <p>{formatFullDate(nextEvent.startsAt)}</p>
                    <p>{formatTime(nextEvent.startsAt)} Uhr</p>
                    <small>{nextEvent.location ?? "Ort noch offen"}</small>
                    {nextEvent.team && <b>{nextEvent.team}</b>}
                  </div>
                  <div className="next-event-actions">
                    <Link href="/kalender" className="primary-button">Details anzeigen</Link>
                    <Link href="/kalender" className="ghost-button">Zum Kalender</Link>
                  </div>
                </>
              ) : (
                <div className="compact-empty">Keine kommenden Termine.</div>
              )}
            </article>
          )}

          {canTraining && data.training && (
            <article className="today-card training-hint-card">
              <div className="today-card-head">
                <div>
                  <span className="card-icon">↔</span>
                  <strong>Trainingshinweise</strong>
                </div>
                <Link href="/training">Details →</Link>
              </div>

              <div className="training-next-compact">
                <span className="training-live-dot" />
                <div>
                  <small>Nächstes Training</small>
                  <strong>
                    {data.training.nextAt
                      ? formatFullDate(data.training.nextAt)+" · "+formatTime(data.training.nextAt)+" Uhr"
                      : "Kein Termin geplant"}
                  </strong>
                </div>
              </div>

              {user.memberId && (
                <div className="training-rate-block">
                  <div
                    className="training-rate-ring"
                    style={{"--training-rate":trainingRate+"%"} as CSSProperties}
                  >
                    <strong>{trainingRate}%</strong>
                  </div>
                  <div>
                    <span>Anwesenheit dieses Jahr</span>
                    <strong>{data.training.personalAttended} / {data.training.personalRecorded}</strong>
                    <small>erfasste Trainingstage</small>
                  </div>
                </div>
              )}

              <div className={`training-hint ${data.training.pendingAttendance ? "is-warning" : ""}`}>
                <span>!</span>
                <p>
                  {data.training.pendingAttendance
                    ? data.training.pendingAttendance+" Trainingstage warten noch auf Anwesenheit."
                    : "Alle erfassten Trainingstage sind aktuell gepflegt."}
                </p>
              </div>
            </article>
          )}
        </div>
      </section>

      {data.celebrations.length>0 && (
        <section className="dashboard-celebrations">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Vereinsleben</span>
              <h2>Heute feiern wir</h2>
            </div>
            <span className="celebration-count">{data.celebrations.length}</span>
          </div>

          <div className="celebration-grid">
            {data.celebrations.map((item)=>(
              <Link
                href={"/mitglieder/"+item.id}
                className={"celebration-card celebration-"+item.kind}
                key={item.kind+item.id}
              >
                <span className="celebration-icon">
                  {item.kind==="birthday" ? "🎂" : "🏅"}
                </span>
                <div>
                  <small>{item.kind==="birthday" ? "Geburtstag" : "Vereinsjubiläum"}</small>
                  <strong>{item.name}</strong>
                  <span>
                    {item.kind==="anniversary" && item.years
                      ? item.years+" Jahre Mitglied"
                      : item.detail}
                  </span>
                </div>
                <b>→</b>
              </Link>
            ))}
          </div>
        </section>
      )}

      {quickActions.length>0 && (
        <section className="quick-control-panel">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Schnellaktionen</span>
              <h2>Mit einem Klick weiter</h2>
            </div>
          </div>
          <div className="quick-control-grid">
            {quickActions.map((item)=>(
              <Link href={item.href} key={item.label}>
                <span>{item.icon}</span>
                <div><strong>{item.label}</strong><small>{item.sub}</small></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-board-grid">
        {canCalendar && (
          <article className="panel compact-board-card">
            <div className="panel-head">
              <div><span className="eyebrow">Kalender</span><h2>Nächste Termine</h2></div>
              <Link href="/kalender" className="text-link">Alle anzeigen →</Link>
            </div>
            <div className="compact-event-list">
              {data.events.length===0 ? (
                <div className="compact-empty">Keine kommenden Termine.</div>
              ) : data.events.slice(0,5).map((event)=>(
                <Link href="/kalender" className="compact-event-row" key={event.title+event.startsAt}>
                  <i className={`event-dot event-type-${event.eventType}`} />
                  <span>{formatDate(event.startsAt)}</span>
                  <div><strong>{event.title}</strong><small>{formatTime(event.startsAt)} Uhr</small></div>
                  <b>{eventTypeLabels[event.eventType] ?? "Termin"}</b>
                </Link>
              ))}
            </div>
          </article>
        )}

        {canResolutions && (
          <article className="panel compact-board-card">
            <div className="panel-head">
              <div><span className="eyebrow">Vorstandsarbeit</span><h2>Aktuelle Beschlüsse</h2></div>
              <Link href="/beschluesse" className="text-link">Alle anzeigen →</Link>
            </div>
            <div className="compact-resolution-list">
              {data.resolutions.length===0 ? (
                <div className="compact-empty">Noch keine Beschlüsse vorhanden.</div>
              ) : data.resolutions.map((resolution)=>(
                <Link
                  href={resolution.number ? "/beschluesse?q="+encodeURIComponent(resolution.number) : "/beschluesse"}
                  key={resolution.id}
                >
                  <span className={`resolution-dot resolution-${resolution.status}`} />
                  <div>
                    <strong>{resolution.number ? resolution.number+" · " : ""}{resolution.title}</strong>
                    <small>{resolutionStatusLabel(resolution.status)}</small>
                  </div>
                  <time>{formatDate(resolution.decidedAt)}</time>
                </Link>
              ))}
            </div>
          </article>
        )}

        {canDocuments && (
          <article className="panel compact-board-card">
            <div className="panel-head">
              <div><span className="eyebrow">Dokumente</span><h2>Zur Prüfung</h2></div>
              <Link href="/dokumente" className="text-link">Alle anzeigen →</Link>
            </div>
            <div className="compact-document-list">
              {data.reviewDocuments.length===0 ? (
                <div className="compact-empty">Keine Dokumente zur Prüfung.</div>
              ) : data.reviewDocuments.map((doc)=>(
                <Link href={"/dokumente/"+doc.id} key={doc.id}>
                  <span className="document-mini-icon">▤</span>
                  <div>
                    <strong>{doc.title}</strong>
                    <small>{doc.category}</small>
                  </div>
                  <b>Zu prüfen</b>
                </Link>
              ))}
            </div>
          </article>
        )}
      </section>

      {data.roleMetrics.length>0 && (
        <section className="role-metric-grid control-role-metrics">
          {data.roleMetrics.map((metric)=>(
            <Link
              href={metric.href}
              className={"role-metric-card role-metric-"+metric.tone}
              key={metric.label}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
              <b>Öffnen ›</b>
            </Link>
          ))}
        </section>
      )}

      {isAdmin && data.integrations.length>0 && (
        <section className="source-health-strip control-system-strip">
          {data.integrations.map((integration)=>(
            <article key={integration.key}>
              <div>
                <span className={`sync-run-dot sync-run-${integration.status==="connected" ? "success" : integration.status==="error" ? "error" : "partial"}`} />
                <strong>{integration.name}</strong>
              </div>
              <b>{integration.status==="connected" ? "Verbunden" : integration.status}</b>
              <small>Sync {formatSync(integration.lastSyncAt)}</small>
            </article>
          ))}
        </section>
      )}

      {data.alerts.length>0 && (
        <section className="control-alert-strip">
          <div>
            <span className="eyebrow">Hinweise</span>
            <strong>{data.alerts.length} Vorgänge brauchen Aufmerksamkeit</strong>
          </div>
          <div>
            {data.alerts.slice(0,3).map((alert,index)=>(
              <Link href={alert.href} className={"alert-pill alert-"+alert.severity} key={alert.kind+index}>
                {alert.title}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
