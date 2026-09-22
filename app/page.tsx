import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Plus,
  Presentation,
  Target,
  Users,
} from "lucide-react";
import { css } from "styled-system/css";
import { getDashboardData } from "@/lib/dashboard-data";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/access";
import { updateTaskStatusInlineAction } from "@/app/aufgaben/actions";
import { resolutionStatusLabel, taskStatusLabel } from "@/lib/ui-labels";
import {
  MotionSurface,
  VdcBadge,
  VdcButton,
  VdcCard,
  VdcEmptyState,
  VdcPageHeader,
  VdcStat,
  vdcStatGrid,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const eventTypeLabels: Record<string, string> = {
  league: "Liga",
  training: "Training",
  tournament: "Turnier",
  board: "Vorstand",
  club: "Verein",
};

const priorityLabels: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};

const page = css({ display: "grid", gap: { base: "4", md: "5" } });
const hero = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "minmax(0,1fr) auto" },
  gap: "4",
  alignItems: "end",
  p: { base: "4", md: "5" },
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l4",
  background: "linear-gradient(135deg, rgba(196,51,30,.12), rgba(196,51,30,.02) 45%, rgba(255,255,255,.015))",
  boxShadow: "md",
});
const heroCopy = css({
  "& h1": {
    mt: "2",
    color: "fg",
    fontSize: { base: "[32px]", md: "[44px]" },
    fontWeight: "950",
    letterSpacing: "-0.05em",
    lineHeight: "1.02",
  },
  "& p": { mt: "2", color: "fg.muted", fontSize: "sm" },
});
const eyebrow = css({
  color: "brand.hover",
  fontSize: "[9px]",
  fontWeight: "900",
  letterSpacing: "0.13em",
  textTransform: "uppercase",
});
const roleCard = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  minW: { lg: "[250px]" },
  p: "3.5",
  border: "1px solid",
  borderColor: "brand.border",
  borderRadius: "l3",
  background: "rgba(14,14,16,.72)",
  "& img": { flexShrink: "0" },
  "& span": { display: "block", color: "fg.muted", fontSize: "[10px]" },
  "& strong": { display: "block", mt: "1", fontSize: "sm", fontWeight: "900" },
});

const section = css({ display: "grid", gap: "3" });
const sectionHead = css({
  display: "flex",
  alignItems: "end",
  justifyContent: "space-between",
  gap: "3",
  "& h2": { mt: "1", fontSize: { base: "lg", md: "xl" }, fontWeight: "900" },
  "& p": { mt: "1", color: "fg.muted", fontSize: "xs" },
});
const importantGrid = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", xl: "repeat(3,minmax(0,1fr))" },
  gap: "3",
  alignItems: "stretch",
});
const cardHead = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  mb: "3",
});
const cardTitle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  "& strong": { fontSize: "sm", fontWeight: "900" },
});
const iconBubble = css({
  display: "grid",
  placeItems: "center",
  w: "8",
  h: "8",
  borderRadius: "pill",
  background: "brand.subtle",
  color: "brand.hover",
});
const textLink = css({
  color: "brand.hover",
  fontSize: "xs",
  fontWeight: "850",
  _hover: { textDecoration: "underline" },
});
const taskList = css({ display: "grid", gap: "2" });
const taskRow = css({
  display: "grid",
  gridTemplateColumns: { base: "minmax(0,1fr)", md: "minmax(0,1fr) auto" },
  gap: "2",
  alignItems: "center",
  p: "2.5",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.raised",
});
const taskMain = css({
  minW: "0",
  "& strong": { display: "block", fontSize: "xs", fontWeight: "850" },
  "& small": { display: "block", mt: "1", color: "fg.muted", fontSize: "[10px]" },
});
const taskMeta = css({ display: "flex", alignItems: "center", justifyContent: { md: "flex-end" }, gap: "1.5", flexWrap: "wrap" });
const inlineForm = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  "& select": {
    h: { base: "[44px]", md: "8" },
    px: "2",
    border: "1px solid",
    borderColor: "surface.border",
    borderRadius: "l1",
    background: "surface.bg",
    color: "fg",
    fontSize: "[10px]",
    outline: "none",
    _focus: { borderColor: "brand.border", boxShadow: "focus" },
  },
});

const eventBox = css({
  display: "grid",
  gap: "1.5",
  p: "3",
  borderLeft: "3px solid",
  borderColor: "brand.solid",
  borderRadius: "l2",
  background: "surface.raised",
  "& h3": { fontSize: "lg", fontWeight: "900" },
  "& p": { color: "fg.muted", fontSize: "xs" },
  "& small": { color: "fg.subtle", fontSize: "[10px]" },
});
const eventActions = css({ display: "flex", gap: "2", mt: "3", flexWrap: "wrap" });
const linkButton = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minH: { base: "[44px]", md: "10" },
  px: "4",
  borderRadius: "l1",
  border: "1px solid",
  borderColor: "brand.solid",
  background: "brand.solid",
  color: "warmWhite",
  fontSize: "sm",
  fontWeight: "850",
  _hover: { background: "brand.hover" },
});
const outlineLink = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minH: { base: "[44px]", md: "10" },
  px: "4",
  borderRadius: "l1",
  border: "1px solid",
  borderColor: "surface.border",
  background: "surface.raised",
  color: "fg",
  fontSize: "sm",
  fontWeight: "850",
  _hover: { borderColor: "brand.border", background: "surface.hover" },
});
const trainingProgress = css({ display: "grid", gap: "2", mt: "3" });
const trainingProgressHead = css({ display: "flex", justifyContent: "space-between", gap: "3", fontSize: "xs" });
const track = css({ h: "2", overflow: "hidden", borderRadius: "pill", background: "surface.hover" });
const range = css({ h: "full", borderRadius: "pill", background: "brand.solid" });
const warningBox = css({
  display: "flex",
  alignItems: "start",
  gap: "2",
  mt: "3",
  p: "2.5",
  border: "1px solid",
  borderColor: "rgba(228,191,112,.22)",
  borderRadius: "l2",
  background: "rgba(228,191,112,.05)",
  color: "status.warning",
  "& p": { color: "fg.muted", fontSize: "xs", lineHeight: "1.45" },
});

const quickGrid = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr 1fr", md: "repeat(4,minmax(0,1fr))", xl: "repeat(7,minmax(0,1fr))" },
  gap: "2",
});
const quickLink = css({
  display: "grid",
  gap: "2",
  minH: "[96px]",
  p: "3",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.bg",
  _hover: { borderColor: "brand.border", background: "surface.raised", transform: "translateY(-1px)" },
  "& svg": { color: "brand.hover" },
  "& strong": { display: "block", fontSize: "xs", fontWeight: "900" },
  "& small": { display: "block", color: "fg.muted", fontSize: "[10px]" },
});

const boardGrid = css({ display: "grid", gridTemplateColumns: { base: "1fr", xl: "repeat(3,minmax(0,1fr))" }, gap: "3" });
const compactList = css({ display: "grid" });
const compactRow = css({
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  gap: "3",
  alignItems: "center",
  py: "2.5",
  borderTop: "1px solid",
  borderColor: "surface.border",
  _first: { borderTop: "0" },
  "& strong": { display: "block", fontSize: "xs", fontWeight: "850" },
  "& small": { display: "block", mt: "1", color: "fg.muted", fontSize: "[10px]" },
  "& time": { color: "fg.subtle", fontSize: "[10px]" },
});

const roleMetricGrid = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr 1fr", lg: "repeat(4,minmax(0,1fr))" },
  gap: "2",
});
const roleMetric = css({
  display: "grid",
  gap: "1",
  p: "3",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.bg",
  _hover: { borderColor: "brand.border", background: "surface.raised" },
  "& span": { color: "fg.muted", fontSize: "[10px]" },
  "& strong": { fontSize: "xl", fontWeight: "950" },
  "& small": { color: "fg.subtle", fontSize: "[10px]" },
  "& b": { mt: "2", color: "brand.hover", fontSize: "[10px]" },
});

const alertStrip = css({
  display: "flex",
  flexDirection: { base: "column", md: "row" },
  justifyContent: "space-between",
  gap: "3",
  p: "3.5",
  border: "1px solid",
  borderColor: "rgba(228,121,114,.22)",
  borderRadius: "l3",
  background: "rgba(228,121,114,.045)",
});
const alertLinks = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const alertLink = css({
  px: "2.5",
  py: "1.5",
  borderRadius: "pill",
  background: "surface.raised",
  color: "status.danger",
  fontSize: "[10px]",
  fontWeight: "800",
});

function formatDate(value: string | null) {
  if (!value) return "Ohne Frist";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }).format(date);
}

function formatFullDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(date);
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

function daysUntil(value: string) {
  const target = new Date(value).getTime();
  const days = Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(target) || days <= 0) return "Heute";
  if (days === 1) return "Morgen";
  return "In " + days + " Tagen";
}

function priorityTone(priority: string): "neutral" | "warning" | "danger" {
  if (priority === "urgent") return "danger";
  if (priority === "high" || priority === "medium") return "warning";
  return "neutral";
}

export default async function DashboardPage() {
  const user = await requireUser();

  const isAdmin = user.roles.includes("admin");
  const canTasks = hasPermission(user.roles, "tasks.read");
  const canTasksWrite = hasPermission(user.roles, "tasks.write");
  const canCalendar = hasPermission(user.roles, "calendar.read");
  const canCalendarWrite = hasPermission(user.roles, "calendar.write");
  const canTraining = hasPermission(user.roles, "training.read");
  const canTrainingWrite = hasPermission(user.roles, "training.write");
  const canMeetingsWrite = hasPermission(user.roles, "meetings.write");
  const canResolutions = hasPermission(user.roles, "resolutions.read");
  const canResolutionsWrite = hasPermission(user.roles, "resolutions.write");
  const canDocuments = hasPermission(user.roles, "documents.read");
  const canDocumentsWrite = hasPermission(user.roles, "documents.write");
  const canMembersWrite = hasPermission(user.roles, "members.write");

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

  const roleLabels: Record<string, string> = {
    admin: "Administration",
    chair: "1. Vorsitz",
    vice_chair: "2. Vorsitz",
    treasurer: "Kasse",
    secretary: "Schriftführung",
    sport_director: "Sportwart",
    team_captain: "Team Captain",
    tournament_director: "Turnierleitung",
    board: "Vorstand",
    member: "Vereinszugang",
  };

  const data = await getDashboardData({
    includeSystem: isAdmin,
    includeTraining: canTraining,
    memberId: user.memberId,
    primaryRole,
  });

  const nextEvent = data.events[0] ?? null;
  const trainingRate = Math.max(0, Math.min(100, data.training?.personalRate ?? 0));
  const today = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date());

  const quickActions = [
    canTasksWrite ? { href: "/aufgaben", label: "Aufgabe", sub: "anlegen", Icon: ClipboardCheck } : null,
    canCalendarWrite ? { href: "/kalender", label: "Termin", sub: "anlegen", Icon: CalendarDays } : null,
    canMeetingsWrite ? { href: "/sitzungen", label: "Sitzung", sub: "planen", Icon: Presentation } : null,
    canResolutionsWrite ? { href: "/beschluesse", label: "Beschluss", sub: "öffnen", Icon: FileCheck2 } : null,
    canDocumentsWrite ? { href: "/dokumente", label: "Dokument", sub: "hochladen", Icon: FileText } : null,
    canTrainingWrite ? { href: "/training", label: "Training", sub: "verwalten", Icon: Target } : null,
    canMembersWrite ? { href: "/mitglieder", label: "Mitglied", sub: "verwalten", Icon: Users } : null,
  ].filter(Boolean) as Array<{ href: string; label: string; sub: string; Icon: typeof Plus }>;

  return (
    <div className={page}>
      <MotionSurface>
        <section className={hero}>
          <div className={heroCopy}>
            <span className={eyebrow}>{today}</span>
            <h1>Gemeinsam. Präzise. Stark.</h1>
            <p>Vestischer Dart Club e.V. · Vereinszentrale</p>
          </div>
          <div className={roleCard}>
            <Image src="/vdc-logo.svg" alt="" width={48} height={48} priority />
            <div><span>Dein Bereich</span><strong>{roleLabels[primaryRole]}</strong></div>
          </div>
        </section>
      </MotionSurface>

      <section className={section}>
        <div className={sectionHead}>
          <div><span className={eyebrow}>Heute wichtig</span><h2>Was jetzt Aufmerksamkeit braucht</h2><p>Aufgaben, Termine und Training ohne Umwege.</p></div>
        </div>

        <div className={importantGrid}>
          {canTasks && (
            <VdcCard padding="md">
              <div className={cardHead}>
                <div className={cardTitle}><span className={iconBubble}><ClipboardCheck size={16} /></span><strong>{data.openTasks} offene Aufgaben</strong></div>
                <Link href="/aufgaben" className={textLink}>Alle →</Link>
              </div>
              {data.tasks.length === 0 ? (
                <VdcEmptyState title="Keine offenen Aufgaben" />
              ) : (
                <div className={taskList}>
                  {data.tasks.slice(0, 4).map((task) => (
                    <div className={taskRow} key={task.id}>
                      <div className={taskMain}><strong>{task.title}</strong><small>{task.category} · {formatDate(task.dueDate)}</small></div>
                      <div className={taskMeta}>
                        <VdcBadge tone={priorityTone(task.priority)}>{priorityLabels[task.priority] ?? task.priority}</VdcBadge>
                        {canTasksWrite ? (
                          <form action={updateTaskStatusInlineAction} className={inlineForm}>
                            <input type="hidden" name="id" value={task.id} />
                            <select name="status" defaultValue={task.status} aria-label={"Status " + task.title}>
                              <option value="open">Offen</option>
                              <option value="in_progress">In Arbeit</option>
                              <option value="blocked">Blockiert</option>
                              <option value="done">Erledigt</option>
                            </select>
                            <VdcButton type="submit" visual="ghost" size="sm" aria-label="Status speichern"><CheckCircle2 size={15} /></VdcButton>
                          </form>
                        ) : (
                          <VdcBadge>{taskStatusLabel(task.status)}</VdcBadge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </VdcCard>
          )}

          {canCalendar && (
            <VdcCard padding="md" tone="raised">
              <div className={cardHead}>
                <div className={cardTitle}><span className={iconBubble}><CalendarDays size={16} /></span><strong>Nächster Termin</strong></div>
                {nextEvent && <VdcBadge tone="brand">{daysUntil(nextEvent.startsAt)}</VdcBadge>}
              </div>
              {nextEvent ? (
                <>
                  <div className={eventBox}>
                    <VdcBadge tone="brand">{eventTypeLabels[nextEvent.eventType] ?? "Termin"}</VdcBadge>
                    <h3>{nextEvent.title}</h3>
                    <p>{formatFullDate(nextEvent.startsAt)} · {formatTime(nextEvent.startsAt)} Uhr</p>
                    <small>{nextEvent.location ?? "Ort noch offen"}</small>
                  </div>
                  <div className={eventActions}>
                    <Link href="/kalender" className={linkButton}>Details anzeigen</Link>
                    <Link href="/kalender" className={outlineLink}>Zum Kalender</Link>
                  </div>
                </>
              ) : <VdcEmptyState title="Keine kommenden Termine" />}
            </VdcCard>
          )}

          {canTraining && data.training && (
            <VdcCard padding="md">
              <div className={cardHead}>
                <div className={cardTitle}><span className={iconBubble}><Target size={16} /></span><strong>Training</strong></div>
                <Link href="/training" className={textLink}>Details →</Link>
              </div>
              <div className={eventBox}>
                <VdcBadge tone="success">Nächstes Training</VdcBadge>
                <h3>{data.training.nextAt ? formatFullDate(data.training.nextAt) : "Kein Termin geplant"}</h3>
                {data.training.nextAt && <p>{formatTime(data.training.nextAt)} Uhr</p>}
              </div>
              {user.memberId && (
                <div className={trainingProgress}>
                  <div className={trainingProgressHead}><span>Anwesenheit dieses Jahr</span><strong>{trainingRate}%</strong></div>
                  <div className={track}><div className={range} style={{ width: trainingRate + "%" }} /></div>
                  <small>{data.training.personalAttended} / {data.training.personalRecorded} erfasste Trainingstage</small>
                </div>
              )}
              {data.training.pendingAttendance > 0 && (
                <div className={warningBox}><AlertTriangle size={16} /><p>{data.training.pendingAttendance} Trainingstage warten noch auf Anwesenheit.</p></div>
              )}
            </VdcCard>
          )}
        </div>
      </section>

      {quickActions.length > 0 && (
        <section className={section}>
          <VdcPageHeader eyebrow="Schnellaktionen" title="Mit einem Klick weiter" />
          <div className={quickGrid}>
            {quickActions.map(({ href, label, sub, Icon }) => (
              <Link href={href} className={quickLink} key={label}>
                <Icon size={18} />
                <div><strong>{label}</strong><small>{sub}</small></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={boardGrid}>
        {canCalendar && (
          <VdcCard padding="md">
            <div className={cardHead}><div className={cardTitle}><CalendarDays size={16} /><strong>Nächste Termine</strong></div><Link href="/kalender" className={textLink}>Alle →</Link></div>
            {data.events.length === 0 ? <VdcEmptyState title="Keine kommenden Termine" /> : (
              <div className={compactList}>
                {data.events.slice(0, 5).map((event) => (
                  <Link href="/kalender" className={compactRow} key={event.title + event.startsAt}>
                    <div><strong>{event.title}</strong><small>{eventTypeLabels[event.eventType] ?? "Termin"} · {formatTime(event.startsAt)} Uhr</small></div>
                    <time>{formatDate(event.startsAt)}</time>
                  </Link>
                ))}
              </div>
            )}
          </VdcCard>
        )}

        {canResolutions && (
          <VdcCard padding="md">
            <div className={cardHead}><div className={cardTitle}><FileCheck2 size={16} /><strong>Offene Beschlüsse</strong></div><Link href="/beschluesse" className={textLink}>Alle →</Link></div>
            {data.resolutions.length === 0 ? <VdcEmptyState title="Keine offenen Beschlüsse" /> : (
              <div className={compactList}>
                {data.resolutions.map((resolution) => (
                  <Link href={resolution.number ? "/beschluesse?q=" + encodeURIComponent(resolution.number) : "/beschluesse"} className={compactRow} key={resolution.id}>
                    <div><strong>{resolution.number ? resolution.number + " · " : ""}{resolution.title}</strong><small>{resolutionStatusLabel(resolution.status)}</small></div>
                    <time>{formatDate(resolution.decidedAt)}</time>
                  </Link>
                ))}
              </div>
            )}
          </VdcCard>
        )}

        {canDocuments && (
          <VdcCard padding="md">
            <div className={cardHead}><div className={cardTitle}><FileText size={16} /><strong>Dokumente zur Prüfung</strong></div><Link href="/dokumente?view=review" className={textLink}>Alle →</Link></div>
            {data.reviewDocuments.length === 0 ? <VdcEmptyState title="Keine Dokumente zur Prüfung" /> : (
              <div className={compactList}>
                {data.reviewDocuments.map((doc) => (
                  <Link href={doc.category === "Protokoll" && doc.meetingId ? "/sitzungen/" + doc.meetingId + "/protokoll" : "/dokumente/" + doc.id} className={compactRow} key={doc.id}>
                    <div><strong>{doc.title}</strong><small>{doc.category}</small></div>
                    <VdcBadge tone="warning">Prüfen</VdcBadge>
                  </Link>
                ))}
              </div>
            )}
          </VdcCard>
        )}
      </section>

      {data.roleMetrics.length > 0 && (
        <section className={section}>
          <VdcPageHeader eyebrow="Dein Bereich" title="Relevante Kennzahlen" />
          <div className={roleMetricGrid}>
            {data.roleMetrics.map((metric) => (
              <Link href={metric.href} className={roleMetric} key={metric.label}>
                <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small><b>Öffnen →</b>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isAdmin && data.integrations.length > 0 && (
        <section className={section}>
          <VdcPageHeader eyebrow="System" title="Integrationen" />
          <div className={vdcStatGrid}>
            {data.integrations.slice(0, 4).map((integration) => (
              <VdcStat
                key={integration.key}
                label={integration.name}
                value={integration.status === "connected" ? "Verbunden" : integration.status}
                note={"Sync " + formatSync(integration.lastSyncAt)}
                accent={integration.status === "error" ? "danger" : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {data.alerts.length > 0 && (
        <section className={alertStrip}>
          <div><span className={eyebrow}>Hinweise</span><strong>{data.alerts.length} Vorgänge brauchen Aufmerksamkeit</strong></div>
          <div className={alertLinks}>
            {data.alerts.slice(0, 3).map((alert, index) => (
              <Link href={alert.href} className={alertLink} key={alert.kind + index}>{alert.title}</Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
