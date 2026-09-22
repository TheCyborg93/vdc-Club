import Link from "next/link";
import {
  BookOpen,
  ClipboardList,
  Files,
  ListChecks,
  Presentation,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { css } from "styled-system/css";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  officialRoleDefinitions,
  roleLabel,
  rolePriority,
  sortedOfficialRoles,
} from "@/lib/roles";
import {
  VdcBadge,
  VdcCard,
  VdcEmptyState,
  VdcPageHeader,
  VdcStat,
  vdcStatGrid,
} from "@/components/ui";

export const dynamic = "force-dynamic";

type BoardUserRow = {
  id: string;
  memberId: string | null;
  userStatus: string;
  displayName: string;
  firstName: string;
  lastName: string;
  memberStatus: string;
  roles: string[];
};

type BoardHistoryRow = {
  id: string;
  title: string;
  startDate: unknown;
  endDate: unknown;
  firstName: string;
  lastName: string;
};

const page = css({ display: "grid", gap: { base: "4", md: "5" } });
const workGrid = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", sm: "repeat(2,minmax(0,1fr))", xl: "repeat(5,minmax(0,1fr))" },
  gap: "2",
});
const workLink = css({
  display: "grid",
  minH: "[128px]",
  p: "3",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l3",
  background: "surface.bg",
  transitionDuration: "normal",
  transitionProperty: "background, border-color, transform",
  _hover: { background: "surface.raised", borderColor: "brand.border", transform: "translateY(-1px)" },
  "& svg": { color: "brand.hover" },
  "& span": { mt: "3", color: "fg.muted", fontSize: "[10px]", textTransform: "uppercase", letterSpacing: "0.08em" },
  "& strong": { mt: "1", color: "fg", fontSize: "[26px]", fontWeight: "950" },
  "& small": { mt: "1", color: "fg.subtle", fontSize: "[10px]", lineHeight: "1.4" },
  "& b": { alignSelf: "end", mt: "3", color: "brand.hover", fontSize: "[10px]" },
});
const sectionHead = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  mb: "3",
  "& h2": { mt: "1", fontSize: "lg", fontWeight: "900" },
});
const eyebrow = css({ color: "brand.hover", fontSize: "[9px]", fontWeight: "900", letterSpacing: "0.13em", textTransform: "uppercase" });
const peopleGrid = css({ display: "grid", gridTemplateColumns: { base: "1fr", xl: "repeat(2,minmax(0,1fr))" }, gap: "3" });
const personCard = css({
  display: "grid",
  gap: "3",
  p: "3.5",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l3",
  background: "surface.raised",
});
const personTop = css({
  display: "grid",
  gridTemplateColumns: "[42px] minmax(0,1fr) auto",
  gap: "3",
  alignItems: "center",
});
const avatar = css({
  display: "grid",
  placeItems: "center",
  w: "[42px]",
  h: "[42px]",
  borderRadius: "pill",
  background: "brand.subtle",
  border: "1px solid",
  borderColor: "brand.border",
  color: "brand.hover",
  fontSize: "xs",
  fontWeight: "950",
});
const personName = css({
  minW: "0",
  "& span": { display: "block", color: "brand.hover", fontSize: "[9px]", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.08em" },
  "& strong": { display: "block", mt: "1", fontSize: "sm", fontWeight: "900" },
});
const personCopy = css({ color: "fg.muted", fontSize: "xs", lineHeight: "1.5" });
const extraRoles = css({
  pt: "2.5",
  borderTop: "1px solid",
  borderColor: "surface.border",
  "& > span": { display: "block", mb: "2", color: "fg.muted", fontSize: "[9px]", textTransform: "uppercase", letterSpacing: "0.08em" },
  "& > div": { display: "flex", gap: "1.5", flexWrap: "wrap" },
});
const personActions = css({ display: "flex", gap: "2", flexWrap: "wrap", pt: "2.5", borderTop: "1px solid", borderColor: "surface.border" });
const smallLink = css({
  display: "inline-flex",
  alignItems: "center",
  minH: "8",
  px: "3",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l1",
  background: "surface.bg",
  color: "fg.muted",
  fontSize: "xs",
  fontWeight: "800",
  _hover: { borderColor: "brand.border", color: "fg" },
});
const drawer = css({
  overflow: "hidden",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l3",
  background: "surface.bg",
  "& > summary": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "3",
    p: "3.5",
    cursor: "pointer",
    listStyle: "none",
  },
  "& > summary::-webkit-details-marker": { display: "none" },
  "& > summary strong": { display: "block", mt: "1", fontSize: "sm", fontWeight: "900" },
  "& > summary small": { display: "block", mt: "1", color: "fg.muted", fontSize: "[10px]" },
  "&[open] > summary": { borderBottom: "1px solid", borderColor: "surface.border", background: "surface.raised" },
});
const drawerBody = css({ p: "3.5" });
const roleOrder = css({ display: "grid", gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))", xl: "repeat(3,minmax(0,1fr))" }, gap: "2", mt: "3" });
const roleRow = css({
  display: "grid",
  gridTemplateColumns: "[28px] minmax(0,1fr)",
  gap: "2",
  p: "2.5",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.raised",
  "& > span": { display: "grid", placeItems: "center", w: "7", h: "7", borderRadius: "l1", background: "brand.subtle", color: "brand.hover", fontSize: "[10px]", fontWeight: "900" },
  "& strong": { display: "block", fontSize: "xs" },
  "& small": { display: "block", mt: "1", color: "fg.muted", fontSize: "[10px]", lineHeight: "1.4" },
});
const historyList = css({ display: "grid" });
const historyRow = css({
  display: "flex",
  flexDirection: { base: "column", sm: "row" },
  justifyContent: "space-between",
  gap: "2",
  py: "2.5",
  borderTop: "1px solid",
  borderColor: "surface.border",
  _first: { borderTop: "0" },
  "& strong": { display: "block", fontSize: "xs" },
  "& span": { display: "block", mt: "1", color: "fg.muted", fontSize: "[10px]" },
});

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(date);
}

export default async function BoardPage() {
  const actor = await requirePermission("members.read");
  const sql = getDb();

  let userRows: BoardUserRow[] = [];
  let history: BoardHistoryRow[] = [];
  let workOverview = { meetings: 0, resolutions: 0, tasks: 0, documents: 0, surveys: 0 };

  if (sql) {
    const [rawUsers, rawHistory, rawWork] = await Promise.all([
      sql`
        SELECT
          u.id::text,
          u.member_id::text,
          u.status AS user_status,
          u.display_name,
          m.first_name,
          m.last_name,
          m.status AS member_status,
          COALESCE(array_agg(ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL), ARRAY[]::text[]) AS roles
        FROM app_users u
        JOIN members m ON m.id = u.member_id
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        WHERE m.status <> 'inactive'
        GROUP BY u.id,m.id
        ORDER BY m.last_name,m.first_name
      `,
      sql`
        SELECT
          bp.id::text,
          bp.title,
          bp.start_date,
          bp.end_date,
          m.first_name,
          m.last_name
        FROM board_positions bp
        JOIN members m ON m.id = bp.member_id
        WHERE bp.is_active = false
        ORDER BY bp.end_date DESC NULLS LAST
        LIMIT 8
      `,
      sql`
        SELECT
          (SELECT count(*)::int FROM meetings WHERE deleted_at IS NULL AND status IN ('planned','running')) AS meetings,
          (SELECT count(*)::int FROM resolutions WHERE status IN ('open','in_progress') AND COALESCE(decision_outcome,'accepted')<>'rejected') AS resolutions,
          (SELECT count(*)::int FROM tasks WHERE deleted_at IS NULL AND status IN ('open','in_progress','blocked')) AS tasks,
          (SELECT count(*)::int FROM documents WHERE deleted_at IS NULL AND status='review') AS documents,
          (SELECT count(*)::int FROM surveys WHERE status='active') AS surveys
      `,
    ]);

    userRows = rawUsers.map((row) => ({
      id: String(row.id),
      memberId: row.member_id ? String(row.member_id) : null,
      userStatus: String(row.user_status),
      displayName: String(row.display_name),
      firstName: String(row.first_name),
      lastName: String(row.last_name),
      memberStatus: String(row.member_status),
      roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
    }));

    history = rawHistory.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      startDate: row.start_date,
      endDate: row.end_date,
      firstName: String(row.first_name),
      lastName: String(row.last_name),
    }));

    workOverview = {
      meetings: Number(rawWork[0]?.meetings ?? 0),
      resolutions: Number(rawWork[0]?.resolutions ?? 0),
      tasks: Number(rawWork[0]?.tasks ?? 0),
      documents: Number(rawWork[0]?.documents ?? 0),
      surveys: Number(rawWork[0]?.surveys ?? 0),
    };
  }

  const people = userRows
    .map((row) => {
      const roles = sortedOfficialRoles(row.roles);
      return { ...row, roles, primaryRole: roles[0] ?? null, additionalRoles: roles.slice(1) };
    })
    .filter((person) => person.primaryRole)
    .sort((a, b) => {
      const roleDifference = rolePriority(String(a.primaryRole)) - rolePriority(String(b.primaryRole));
      return roleDifference !== 0
        ? roleDifference
        : `${String(a.lastName)} ${String(a.firstName)}`.localeCompare(`${String(b.lastName)} ${String(b.firstName)}`, "de");
    });

  const canManage = hasPermission(actor.roles, "settings.manage");
  const canMeetings = hasPermission(actor.roles, "meetings.read");
  const canResolutions = hasPermission(actor.roles, "resolutions.read");
  const canTasks = hasPermission(actor.roles, "tasks.read");
  const canDocuments = hasPermission(actor.roles, "documents.read");
  const canSurveys = hasPermission(actor.roles, "surveys.read");
  const multipleRoles = people.filter((person) => person.additionalRoles.length > 0).length;
  const activeAccounts = people.filter((person) => person.userStatus === "active").length;

  const workItems = [
    canMeetings ? { href: "/sitzungen", label: "Sitzungen", value: workOverview.meetings, note: "geplant oder laufend", Icon: Presentation } : null,
    canResolutions ? { href: "/beschluesse", label: "Beschlüsse", value: workOverview.resolutions, note: "offen oder in Umsetzung", Icon: BookOpen } : null,
    canTasks ? { href: "/aufgaben", label: "Aufgaben", value: workOverview.tasks, note: "aktive Aufgaben", Icon: ListChecks } : null,
    canDocuments ? { href: "/dokumente?view=review", label: "Dokumente", value: workOverview.documents, note: "zur Prüfung", Icon: Files } : null,
    canSurveys ? { href: "/umfragen", label: "Umfragen", value: workOverview.surveys, note: "aktuell aktiv", Icon: ClipboardList } : null,
  ].filter(Boolean) as Array<{ href: string; label: string; value: number; note: string; Icon: typeof ShieldCheck }>;

  return (
    <div className={page}>
      <VdcPageHeader
        eyebrow="Verein"
        title="Vorstand"
        description="Aktuelle Besetzung und laufende Vorstandsarbeit an einem Ort. Rollen und Zugänge werden automatisch aus der Vereinsverwaltung übernommen."
        actions={canManage ? <Link href="/admin/benutzer" className={smallLink}><Settings size={15} /> Rollen verwalten</Link> : undefined}
      />

      <section className={vdcStatGrid}>
        <VdcStat label="Personen mit Funktion" value={people.length} note="automatisch aus Rollen" />
        <VdcStat label="Mehrfachrollen" value={multipleRoles} note="mit Zusatzvermerk" />
        <VdcStat label="Aktive Zugänge" value={activeAccounts} note="VDC Club Login aktiv" />
        <VdcStat label="Rollenarten" value={officialRoleDefinitions.length} note="offizielle Struktur" />
      </section>

      <section>
        <div className={sectionHead}>
          <div><span className={eyebrow}>Vorstandsarbeit</span><h2>Direkt weiterarbeiten</h2></div>
        </div>
        <div className={workGrid}>
          {workItems.map(({ href, label, value, note, Icon }) => (
            <Link href={href} className={workLink} key={label}>
              <Icon size={20} />
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
              <b>Öffnen →</b>
            </Link>
          ))}
        </div>
      </section>

      <VdcCard padding="md">
        <div className={sectionHead}>
          <div><span className={eyebrow}>Aktuell</span><h2>Besetzung</h2></div>
          <VdcBadge tone="brand">{people.length}</VdcBadge>
        </div>

        {people.length === 0 ? (
          <VdcEmptyState title="Noch keine Vorstandsrollen hinterlegt" />
        ) : (
          <div className={peopleGrid}>
            {people.map((person) => (
              <article className={personCard} key={person.id}>
                <div className={personTop}>
                  <div className={avatar}>
                    {person.firstName.slice(0, 1)}{person.lastName.slice(0, 1)}
                  </div>
                  <div className={personName}>
                    <span>{person.primaryRole ? roleLabel(String(person.primaryRole)) : "Funktion"}</span>
                    <strong>{person.firstName} {person.lastName}</strong>
                  </div>
                  <VdcBadge tone={person.userStatus === "active" ? "success" : "danger"}>
                    {person.userStatus === "active" ? "Login aktiv" : "Login deaktiviert"}
                  </VdcBadge>
                </div>

                <p className={personCopy}>
                  {officialRoleDefinitions.find((role) => role.key === person.primaryRole)?.description ?? "Vereinsfunktion"}
                </p>

                {person.additionalRoles.length > 0 && (
                  <div className={extraRoles}>
                    <span>Weitere Rollen</span>
                    <div>
                      {person.additionalRoles.map((role) => <VdcBadge key={role}>{roleLabel(role)}</VdcBadge>)}
                    </div>
                  </div>
                )}

                <div className={personActions}>
                  {person.memberId && <Link href={"/mitglieder/" + person.memberId} className={smallLink}><Users size={14} /> Mitglied öffnen</Link>}
                  {canManage && <Link href="/admin/benutzer" className={smallLink}><Settings size={14} /> Rollen</Link>}
                </div>
              </article>
            ))}
          </div>
        )}
      </VdcCard>

      <details className={drawer}>
        <summary>
          <div><span className={eyebrow}>Struktur</span><strong>Rollenreihenfolge</strong><small>Festlegung der angezeigten Hauptrolle</small></div>
          <VdcBadge>Details</VdcBadge>
        </summary>
        <div className={drawerBody}>
          <p className={personCopy}>Hat eine Person mehrere Rollen, wird die zuerst aufgeführte Rolle als Hauptrolle verwendet. Alle weiteren Rollen bleiben aktiv.</p>
          <div className={roleOrder}>
            {officialRoleDefinitions.map((role, index) => (
              <div className={roleRow} key={role.key}>
                <span>{index + 1}</span>
                <div><strong>{role.label}</strong><small>{role.description}</small></div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {history.length > 0 && (
        <details className={drawer}>
          <summary>
            <div><span className={eyebrow}>Historie</span><strong>Frühere erfasste Ämter</strong><small>{history.length} Einträge</small></div>
            <VdcBadge>{history.length}</VdcBadge>
          </summary>
          <div className={drawerBody}>
            <div className={historyList}>
              {history.map((position) => (
                <div className={historyRow} key={position.id}>
                  <div><strong>{position.title}</strong><span>{position.firstName} {position.lastName}</span></div>
                  <span>{formatDate(position.startDate)} – {formatDate(position.endDate)}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
