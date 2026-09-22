import Link from "next/link";
import { Check, ClipboardCheck, Pencil, Plus } from "lucide-react";
import { css } from "styled-system/css";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  createTaskAction,
  updateTaskDetailsAction,
  updateTaskStatusAction,
} from "@/app/aufgaben/actions";
import { moveToTrashAction } from "@/app/admin/papierkorb/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  VdcBadge,
  VdcButton,
  VdcCard,
  VdcEmptyState,
  VdcPageHeader,
  VdcStat,
  vdcStatGrid,
} from "@/components/ui";

const errors: Record<string, string> = {
  database: "Die Datenbankverbindung fehlt.",
  missing: "Ein Aufgabentitel ist erforderlich.",
  linked_delete: "Diese Aufgabe gehört zu einem Vereinsvorgang und kann nicht gelöscht werden. Nutze stattdessen den passenden Status.",
};

const statusLabels: Record<string, string> = {
  open: "Offen",
  in_progress: "In Arbeit",
  blocked: "Blockiert",
  done: "Erledigt",
};

const priorityLabels: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};

export const dynamic = "force-dynamic";

const page = css({ display: "grid", gap: { base: "4", md: "5" } });
const feedback = css({ p: "3", border: "1px solid", borderRadius: "l2", fontSize: "xs", fontWeight: "750" });
const feedbackError = css({ borderColor: "rgba(228,121,114,.24)", background: "rgba(228,121,114,.07)", color: "status.danger" });
const feedbackSuccess = css({ borderColor: "rgba(143,198,162,.24)", background: "rgba(143,198,162,.07)", color: "status.success" });
const tabs = css({
  display: "grid",
  gridTemplateColumns: { base: "repeat(2,minmax(0,1fr))", md: "repeat(3,minmax(0,1fr))", xl: "repeat(6,minmax(0,1fr))" },
  gap: "1",
  p: "1",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.bg",
});
const tab = css({
  display: "grid",
  placeItems: "center",
  minH: "9",
  px: "2",
  borderRadius: "l1",
  color: "fg.muted",
  fontSize: "xs",
  fontWeight: "800",
  textAlign: "center",
  _hover: { background: "surface.hover", color: "fg" },
});
const tabActive = css({ background: "brand.subtle", color: "brand.hover" });
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
  "& > summary strong": { fontSize: "sm", fontWeight: "900" },
  "&[open] > summary": { borderBottom: "1px solid", borderColor: "surface.border", background: "surface.raised" },
});
const form = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))", xl: "repeat(5,minmax(0,1fr))" },
  gap: "3",
  p: "3.5",
});
const field = css({ display: "grid", gap: "1.5", color: "fg.muted", fontSize: "xs", fontWeight: "750" });
const fieldWide = css({ gridColumn: { md: "1 / -1" } });
const control = css({
  w: "full",
  minH: "10",
  px: "3",
  py: "2",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l1",
  background: "surface.bg",
  color: "fg",
  outline: "none",
  _focus: { borderColor: "brand.solid", boxShadow: "focus" },
});
const formAction = css({ gridColumn: { md: "1 / -1" }, justifySelf: { md: "end" } });
const board = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "repeat(2,minmax(0,1fr))", "2xl": "repeat(4,minmax(0,1fr))" },
  gap: "3",
  alignItems: "start",
});
const column = css({
  overflow: "hidden",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l3",
  background: "surface.bg",
});
const columnHead = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  p: "3",
  borderBottom: "1px solid",
  borderColor: "surface.border",
  background: "surface.raised",
  "& h2": { fontSize: "sm", fontWeight: "900" },
});
const columnList = css({ display: "grid", gap: "2", p: "2" });
const taskCard = css({
  display: "grid",
  gap: "2.5",
  p: "3",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.raised",
});
const overdueCard = css({ borderColor: "rgba(228,121,114,.24)", background: "rgba(228,121,114,.035)" });
const taskTop = css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2", flexWrap: "wrap" });
const taskTitle = css({ fontSize: "sm", fontWeight: "900", lineHeight: "1.35" });
const taskDescription = css({ color: "fg.muted", fontSize: "xs", lineHeight: "1.5" });
const sourceLink = css({
  display: "grid",
  gap: "1",
  p: "2.5",
  border: "1px solid",
  borderColor: "brand.border",
  borderRadius: "l1",
  background: "brand.subtle",
  "& span": { color: "fg.muted", fontSize: "[9px]", textTransform: "uppercase", letterSpacing: "0.07em" },
  "& strong": { color: "brand.hover", fontSize: "xs" },
  _hover: { borderColor: "brand.solid" },
});
const taskInfo = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "2",
  flexWrap: "wrap",
  pt: "2",
  borderTop: "1px solid",
  borderColor: "surface.border",
  color: "fg.muted",
  fontSize: "[10px]",
});
const editDrawer = css({
  overflow: "hidden",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l1",
  "& > summary": { p: "2.5", cursor: "pointer", listStyle: "none", color: "fg.muted", fontSize: "xs", fontWeight: "800" },
  "& > summary::-webkit-details-marker": { display: "none" },
  "&[open] > summary": { borderBottom: "1px solid", borderColor: "surface.border", color: "fg" },
});
const editForm = css({ display: "grid", gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))" }, gap: "2.5", p: "2.5" });
const actions = css({ display: "flex", gap: "1.5", flexWrap: "wrap", pt: "1" });

function formatDate(value: unknown) {
  if (!value) return "Keine Frist";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Keine Frist" : new Intl.DateTimeFormat("de-DE").format(date);
}

function priorityTone(priority: string): "neutral" | "warning" | "danger" {
  if (priority === "urgent") return "danger";
  if (priority === "high" || priority === "medium") return "warning";
  return "neutral";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string; saved?: string; view?: string }>;
}) {
  const actor = await requirePermission("tasks.read");
  const sql = getDb();
  const params = await searchParams;
  const view = ["active", "mine", "overdue", "priority", "done", "all"].includes(params.view ?? "")
    ? String(params.view)
    : "active";

  const [tasks, members, counts] = sql
    ? await Promise.all([
        sql`
          SELECT
            t.id::text,t.title,t.description,t.category,t.status,t.priority,t.due_date,t.created_at,
            (t.due_date<CURRENT_DATE AND t.status IN ('open','in_progress','blocked')) AS is_overdue,
            t.source_type,t.source_id::text,t.owner_member_id::text,
            m.first_name,m.last_name,r.resolution_number,r.title AS resolution_title
          FROM tasks t
          LEFT JOIN members m ON m.id=t.owner_member_id
          LEFT JOIN resolutions r ON t.source_type='resolution' AND r.id=t.source_id
          WHERE t.status<>'cancelled'
            AND t.deleted_at IS NULL
            AND (
              ${view}='all'
              OR (${view}='active' AND t.status IN ('open','in_progress','blocked'))
              OR (${view}='mine' AND t.status IN ('open','in_progress','blocked') AND t.owner_member_id=${actor.memberId || null}::uuid)
              OR (${view}='overdue' AND t.status IN ('open','in_progress','blocked') AND t.due_date<CURRENT_DATE)
              OR (${view}='priority' AND t.status IN ('open','in_progress','blocked') AND t.priority IN ('high','urgent'))
              OR (${view}='done' AND t.status='done')
            )
          ORDER BY
            CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
            t.due_date NULLS LAST,t.created_at DESC
        `,
        sql`
          SELECT id::text,first_name,last_name
          FROM members
          WHERE status='active'
          ORDER BY last_name,first_name
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status='open')::int AS open,
            count(*) FILTER (WHERE priority IN ('high','urgent') AND status NOT IN ('done','cancelled'))::int AS high,
            count(*) FILTER (WHERE status='in_progress')::int AS progress,
            count(*) FILTER (WHERE status='done' AND completed_at>=date_trunc('year',CURRENT_DATE))::int AS done
          FROM tasks
          WHERE deleted_at IS NULL
        `,
      ])
    : [[], [], [{ open: 0, high: 0, progress: 0, done: 0 }]];

  const count = counts[0] ?? {};
  const canWrite = hasPermission(actor.roles, "tasks.write");
  const allColumns = ["open", "in_progress", "blocked", "done"] as const;
  const columns = view === "done"
    ? allColumns.filter((status) => status === "done")
    : view === "all"
      ? [...allColumns]
      : allColumns.filter((status) => status !== "done");

  const taskViews = [
    ["active", "Aktiv"],
    ["mine", "Meine"],
    ["overdue", "Überfällig"],
    ["priority", "Hohe Priorität"],
    ["done", "Erledigt"],
    ["all", "Alle"],
  ];

  return (
    <div className={page}>
      <VdcPageHeader
        eyebrow="Organisation"
        title="Aufgaben"
        description="Vorstandsaufgaben mit Verantwortlichen, Fristen, Prioritäten und Status."
      />

      {params.error && <div className={[feedback, feedbackError].join(" ")}>{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(params.created || params.deleted || params.saved) && (
        <div className={[feedback, feedbackSuccess].join(" ")}>
          {params.created ? "Aufgabe wurde angelegt." : params.deleted ? "Aufgabe wurde in den Papierkorb verschoben." : "Aufgabe wurde aktualisiert."}
        </div>
      )}

      <nav className={tabs} aria-label="Aufgaben filtern">
        {taskViews.map(([key, label]) => (
          <Link key={key} href={key === "active" ? "/aufgaben" : "/aufgaben?view=" + key} className={[tab, view === key ? tabActive : ""].join(" ")}>
            {label}
          </Link>
        ))}
      </nav>

      <section className={vdcStatGrid}>
        <VdcStat label="Offen" value={Number(count.open ?? 0)} note="noch nicht begonnen" />
        <VdcStat label="Hohe Priorität" value={Number(count.high ?? 0)} note="hoch oder dringend" accent="danger" />
        <VdcStat label="In Arbeit" value={Number(count.progress ?? 0)} note="aktuell bearbeitet" accent="brand" />
        <VdcStat label="Erledigt" value={Number(count.done ?? 0)} note="dieses Jahr" />
      </section>

      {canWrite && (
        <details className={drawer}>
          <summary>
            <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
              <Plus size={16} />
              <strong>Neue Aufgabe anlegen</strong>
            </div>
            <VdcBadge tone="brand">Neu</VdcBadge>
          </summary>
          <form action={createTaskAction} className={form}>
            <label className={field}>Titel<input className={control} name="title" required placeholder="Was muss erledigt werden?" /></label>
            <label className={field}>Bereich<input className={control} name="category" placeholder="z. B. Material, Liga, Vorstand" /></label>
            <label className={field}>Verantwortlich
              <select className={control} name="ownerMemberId" defaultValue="">
                <option value="">Noch offen</option>
                {members.map((member) => <option value={String(member.id)} key={String(member.id)}>{String(member.first_name)} {String(member.last_name)}</option>)}
              </select>
            </label>
            <label className={field}>Priorität
              <select className={control} name="priority" defaultValue="medium">
                <option value="low">Niedrig</option><option value="medium">Mittel</option><option value="high">Hoch</option><option value="urgent">Dringend</option>
              </select>
            </label>
            <label className={field}>Frist<input className={control} name="dueDate" type="date" /></label>
            <label className={[field, fieldWide].join(" ")}>Beschreibung<textarea className={control} name="description" rows={3} /></label>
            <div className={formAction}><VdcButton type="submit"><Plus size={15} /> Aufgabe speichern</VdcButton></div>
          </form>
        </details>
      )}

      <section className={board}>
        {columns.map((status) => {
          const items = tasks.filter((task) => task.status === status);
          return (
            <article className={column} key={status}>
              <div className={columnHead}><h2>{statusLabels[status]}</h2><VdcBadge>{items.length}</VdcBadge></div>
              <div className={columnList}>
                {items.length === 0 ? (
                  <VdcEmptyState title="Keine Aufgaben" />
                ) : items.map((task) => (
                  <div className={[taskCard, task.is_overdue ? overdueCard : ""].join(" ")} key={String(task.id)}>
                    <div className={taskTop}>
                      <VdcBadge tone={priorityTone(String(task.priority))}>{priorityLabels[String(task.priority)] ?? String(task.priority)}</VdcBadge>
                      <div className={css({ display: "flex", gap: "1.5", flexWrap: "wrap" })}>
                        {task.is_overdue && <VdcBadge tone="danger">Überfällig</VdcBadge>}
                        <VdcBadge>{task.category ? String(task.category) : "Allgemein"}</VdcBadge>
                      </div>
                    </div>

                    <h3 className={taskTitle}>{String(task.title)}</h3>

                    {task.source_type === "resolution" && task.source_id && (
                      <Link href={"/beschluesse?q=" + encodeURIComponent(String(task.resolution_number ?? task.resolution_title ?? ""))} className={sourceLink}>
                        <span>Aus Beschluss</span>
                        <strong>{task.resolution_number ? String(task.resolution_number) + " · " : ""}{task.resolution_title ? String(task.resolution_title) : "Beschluss öffnen"}</strong>
                      </Link>
                    )}

                    {task.description && <p className={taskDescription}>{String(task.description)}</p>}
                    <div className={taskInfo}>
                      <span>{task.first_name ? `${task.first_name} ${task.last_name}` : "Nicht zugewiesen"}</span>
                      <span>{formatDate(task.due_date)}</span>
                    </div>

                    {canWrite && (
                      <details className={editDrawer}>
                        <summary><Pencil size={13} /> Aufgabe bearbeiten</summary>
                        <form action={updateTaskDetailsAction} className={editForm}>
                          <input type="hidden" name="id" value={String(task.id)} />
                          <label className={field}>Titel<input className={control} name="title" defaultValue={String(task.title)} required /></label>
                          <label className={field}>Bereich<input className={control} name="category" defaultValue={String(task.category ?? "")} /></label>
                          <label className={field}>Verantwortlich
                            <select className={control} name="ownerMemberId" defaultValue={task.owner_member_id ? String(task.owner_member_id) : ""}>
                              <option value="">Noch offen</option>
                              {members.map((member) => <option key={String(member.id)} value={String(member.id)}>{String(member.first_name)} {String(member.last_name)}</option>)}
                            </select>
                          </label>
                          <label className={field}>Priorität
                            <select className={control} name="priority" defaultValue={String(task.priority)}>
                              <option value="low">Niedrig</option><option value="medium">Mittel</option><option value="high">Hoch</option><option value="urgent">Dringend</option>
                            </select>
                          </label>
                          <label className={field}>Frist<input className={control} name="dueDate" type="date" defaultValue={task.due_date ? String(task.due_date).slice(0, 10) : ""} /></label>
                          <label className={[field, fieldWide].join(" ")}>Beschreibung<textarea className={control} name="description" rows={3} defaultValue={String(task.description ?? "")} /></label>
                          <div className={formAction}><VdcButton type="submit" visual="outline" size="sm"><Check size={14} /> Änderungen speichern</VdcButton></div>
                        </form>
                      </details>
                    )}

                    {canWrite && (
                      <div className={actions}>
                        {status !== "open" && <form action={updateTaskStatusAction}><input type="hidden" name="id" value={String(task.id)} /><input type="hidden" name="status" value="open" /><VdcButton type="submit" visual="ghost" size="sm">Offen</VdcButton></form>}
                        {status !== "in_progress" && <form action={updateTaskStatusAction}><input type="hidden" name="id" value={String(task.id)} /><input type="hidden" name="status" value="in_progress" /><VdcButton type="submit" visual="outline" size="sm">In Arbeit</VdcButton></form>}
                        {status !== "blocked" && status !== "done" && <form action={updateTaskStatusAction}><input type="hidden" name="id" value={String(task.id)} /><input type="hidden" name="status" value="blocked" /><VdcButton type="submit" visual="ghost" size="sm">Blockiert</VdcButton></form>}
                        {status !== "done" && <form action={updateTaskStatusAction}><input type="hidden" name="id" value={String(task.id)} /><input type="hidden" name="status" value="done" /><VdcButton type="submit" size="sm"><Check size={14} /> Erledigt</VdcButton></form>}
                        {!task.source_type && <form action={moveToTrashAction}><input type="hidden" name="type" value="task" /><input type="hidden" name="id" value={String(task.id)} /><ConfirmSubmitButton message={"Aufgabe „" + String(task.title) + "“ in den Papierkorb verschieben?"}>Löschen</ConfirmSubmitButton></form>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
