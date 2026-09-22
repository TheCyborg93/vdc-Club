import Link from "next/link";
import {
  Archive,
  FileText,
  Filter,
  FolderOpen,
  Plus,
  Upload,
} from "lucide-react";
import { css } from "styled-system/css";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  archiveDocumentAction,
  createDocumentAction,
  updateDocumentStatusAction,
} from "@/app/dokumente/actions";
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

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  review: "Zu prüfen",
  archived: "Archiviert",
  expired: "Abgelaufen",
};

const errorLabels: Record<string, string> = {
  database: "Die Datenbank ist nicht verfügbar.",
  missing: "Titel und Kategorie sind erforderlich.",
  invalid: "Der hinterlegte externe Link ist ungültig.",
  source: "Bitte entweder eine Datei hochladen oder einen externen Link verwenden – nicht beides.",
  empty: "Die ausgewählte Datei ist leer.",
  size: "Die Datei ist zu groß. Maximal erlaubt sind 4 MB.",
  type: "Dieser Dateityp ist nicht erlaubt.",
  storage: "Der private Dokumentenspeicher ist noch nicht konfiguriert.",
  upload: "Die Datei konnte nicht in den privaten Speicher hochgeladen werden.",
  protocol_managed: "Dieses Sitzungsprotokoll wird automatisch über den Sitzungsworkflow verwaltet.",
};

const page = css({ display: "grid", gap: { base: "4", md: "5" } });
const secondaryLink = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  minH: "10",
  px: "4",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l1",
  background: "surface.raised",
  color: "fg",
  fontSize: "sm",
  fontWeight: "850",
  _hover: { borderColor: "brand.border", background: "surface.hover" },
});
const feedback = css({ p: "3", border: "1px solid", borderRadius: "l2", fontSize: "xs", fontWeight: "750" });
const feedbackError = css({ borderColor: "rgba(228,121,114,.24)", background: "rgba(228,121,114,.07)", color: "status.danger" });
const feedbackSuccess = css({ borderColor: "rgba(143,198,162,.24)", background: "rgba(143,198,162,.07)", color: "status.success" });
const tabs = css({
  display: "grid",
  gridTemplateColumns: { base: "repeat(2,minmax(0,1fr))", md: "repeat(4,minmax(0,1fr))" },
  gap: "1",
  p: "1",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.bg",
});
const tab = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minH: "9",
  px: "3",
  borderRadius: "l1",
  color: "fg.muted",
  fontSize: "xs",
  fontWeight: "800",
  _hover: { background: "surface.hover", color: "fg" },
});
const tabActive = css({ background: "brand.subtle", color: "brand.hover" });
const tabWarning = css({ background: "rgba(228,191,112,.08)", color: "status.warning" });
const count = css({ display: "grid", placeItems: "center", minW: "6", h: "6", px: "1.5", borderRadius: "pill", background: "surface.hover", fontSize: "[10px]" });
const filterDrawer = css({
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
  "&[open] > summary": { borderBottom: "1px solid", borderColor: "surface.border", background: "surface.raised" },
});
const filterForm = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", md: "minmax(0,1.6fr) repeat(2,minmax(150px,.7fr)) auto auto" },
  gap: "2.5",
  alignItems: "end",
  p: "3.5",
});
const field = css({ display: "grid", gap: "1.5", color: "fg.muted", fontSize: "xs", fontWeight: "750" });
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
const sectionHead = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  mb: "3",
  "& h2": { mt: "1", fontSize: "lg", fontWeight: "900" },
});
const eyebrow = css({ color: "brand.hover", fontSize: "[9px]", fontWeight: "900", letterSpacing: "0.13em", textTransform: "uppercase" });
const list = css({ display: "grid", gap: "2" });
const docCard = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", md: "[44px] minmax(0,1fr) auto" },
  gap: "3",
  alignItems: "start",
  p: "3",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.raised",
});
const systemDoc = css({ borderColor: "brand.border", background: "linear-gradient(135deg, rgba(196,51,30,.07), rgba(255,255,255,.008))" });
const icon = css({
  display: "grid",
  placeItems: "center",
  w: "11",
  h: "11",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l2",
  background: "surface.bg",
  color: "brand.hover",
});
const main = css({
  minW: "0",
  "& > span": { display: "block", mt: "1", color: "fg.muted", fontSize: "[10px]" },
  "& > p": { mt: "2", color: "fg.muted", fontSize: "xs", lineHeight: "1.5" },
});
const titleRow = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const titleLink = css({ fontSize: "sm", fontWeight: "900", _hover: { color: "brand.hover" } });
const metaBadges = css({ display: "flex", gap: "1.5", flexWrap: "wrap" });
const deadlineRow = css({ display: "flex", gap: "1.5", mt: "2", flexWrap: "wrap" });
const chip = css({ px: "2", py: "1", borderRadius: "pill", background: "surface.hover", color: "fg.muted", fontSize: "[9px]" });
const links = css({ display: "flex", gap: "1.5", mt: "2", flexWrap: "wrap", "& span": { px: "2", py: "1", borderRadius: "pill", background: "surface.bg", color: "fg.muted", fontSize: "[9px]" } });
const actions = css({
  display: "flex",
  flexDirection: { base: "row", md: "column" },
  alignItems: { md: "stretch" },
  gap: "1.5",
  flexWrap: "wrap",
  minW: { md: "[145px]" },
  "& form": { display: "flex", gap: "1", flexWrap: "wrap" },
  "& select": {
    minH: "8",
    px: "2",
    border: "1px solid",
    borderColor: "surface.border",
    borderRadius: "l1",
    background: "surface.bg",
    color: "fg",
    fontSize: "[10px]",
  },
});
const actionLink = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minH: "8",
  px: "2.5",
  border: "1px solid",
  borderColor: "surface.border",
  borderRadius: "l1",
  background: "surface.bg",
  color: "fg.muted",
  fontSize: "xs",
  fontWeight: "800",
  _hover: { borderColor: "brand.border", color: "fg" },
});
const primaryAction = css({ borderColor: "brand.solid", background: "brand.solid", color: "warmWhite", _hover: { background: "brand.hover" } });
const createDrawer = css({
  overflow: "hidden",
  border: "1px solid",
  borderColor: "brand.border",
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
  "&[open] > summary": { borderBottom: "1px solid", borderColor: "surface.border", background: "brand.subtle" },
});
const createForm = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", md: "repeat(2,minmax(0,1fr))" },
  gap: "3",
  p: "3.5",
});
const wide = css({ gridColumn: { md: "1 / -1" } });
const uploadBox = css({ gridColumn: { md: "1 / -1" }, display: "grid", gap: "2", p: "3", border: "1px dashed", borderColor: "brand.border", borderRadius: "l2", background: "brand.subtle" });
const divider = css({ gridColumn: { md: "1 / -1" }, display: "flex", alignItems: "center", gap: "2", color: "fg.subtle", fontSize: "[10px]", "&::before, &::after": { content: '""', h: "[1px]", flex: "1", background: "surface.border" } });
const submitRow = css({ gridColumn: { md: "1 / -1" }, justifySelf: { md: "end" } });

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(date);
}

function formatBytes(value: unknown) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " KB";
  return (bytes / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " MB";
}

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "active") return "success";
  if (status === "review") return "warning";
  if (status === "expired") return "danger";
  if (status === "draft") return "info";
  return "neutral";
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string; created?: string; archived?: string; uploaded?: string; deleted?: string;
    q?: string; category?: string; status?: string; view?: string;
  }>;
}) {
  const actor = await requirePermission("documents.read");
  const sql = getDb();
  const params = await searchParams;
  const canWrite = hasPermission(actor.roles, "documents.write");
  const q = (params.q ?? "").trim();
  const category = (params.category ?? "").trim();
  const status = (params.status ?? "").trim();
  const requestedView = ["active", "review", "contracts", "all"].includes(params.view ?? "") ? String(params.view) : "active";
  const view = status ? "all" : requestedView;

  const [documents, counts, members, meetings, resolutions, financeEntries, sponsors, categories] = sql
    ? await Promise.all([
        sql`
          SELECT
            d.id::text,d.title,d.category,d.storage_type,d.storage_ref,d.status,
            d.document_date,d.valid_until,d.review_on,d.notes,d.created_at,
            d.original_filename,d.file_size_bytes,d.mime_type,d.uploaded_at,d.current_version_number,
            m.first_name,m.last_name,mt.id::text AS meeting_id,mt.title AS meeting_title,
            ai.position AS agenda_position,ai.title AS agenda_title,
            r.resolution_number,r.title AS resolution_title,
            f.description AS finance_description,s.name AS sponsor_name
          FROM documents d
          LEFT JOIN members m ON m.id=d.member_id
          LEFT JOIN meetings mt ON mt.id=d.meeting_id
          LEFT JOIN agenda_items ai ON ai.id=d.agenda_item_id
          LEFT JOIN resolutions r ON r.id=d.resolution_id
          LEFT JOIN finance_entries f ON f.id=d.finance_entry_id
          LEFT JOIN sponsors s ON s.id=d.sponsor_id
          WHERE d.status<>'archived'
            AND d.deleted_at IS NULL
            AND (${q}='' OR d.title ILIKE '%' || ${q} || '%' OR COALESCE(d.notes,'') ILIKE '%' || ${q} || '%')
            AND (${category}='' OR d.category=${category})
            AND (${status}='' OR d.status=${status})
            AND (
              ${view}='all'
              OR (${view}='active' AND d.status IN ('active','draft'))
              OR (${view}='review' AND (
                d.status='review'
                OR (d.review_on IS NOT NULL AND d.review_on<=CURRENT_DATE+interval '30 days')
                OR (d.valid_until IS NOT NULL AND d.valid_until<=CURRENT_DATE+interval '30 days')
              ))
              OR (${view}='contracts' AND d.category='Vertrag' AND d.status='active')
            )
          ORDER BY
            CASE
              WHEN d.status='review' THEN 0
              WHEN d.review_on IS NOT NULL AND d.review_on<=CURRENT_DATE+interval '30 days' THEN 1
              WHEN d.valid_until IS NOT NULL AND d.valid_until<=CURRENT_DATE+interval '30 days' THEN 2
              ELSE 3
            END,
            COALESCE(d.document_date,d.created_at::date) DESC,d.created_at DESC
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status<>'archived')::int AS total,
            count(*) FILTER (WHERE status IN ('active','draft'))::int AS active_view,
            count(*) FILTER (WHERE category='Protokoll' AND status<>'archived')::int AS minutes,
            count(*) FILTER (WHERE category='Vertrag' AND status='active')::int AS contracts,
            count(*) FILTER (
              WHERE status='review'
                 OR (review_on IS NOT NULL AND review_on<=CURRENT_DATE+interval '30 days' AND status='active')
                 OR (valid_until IS NOT NULL AND valid_until<=CURRENT_DATE+interval '30 days' AND status='active')
            )::int AS review,
            count(*) FILTER (WHERE status='archived')::int AS archived
          FROM documents
          WHERE deleted_at IS NULL
        `,
        sql`SELECT id::text,first_name,last_name FROM members WHERE status='active' ORDER BY last_name,first_name`,
        sql`SELECT id::text,title,starts_at FROM meetings WHERE deleted_at IS NULL ORDER BY starts_at DESC LIMIT 40`,
        sql`SELECT id::text,resolution_number,title FROM resolutions ORDER BY decided_at DESC LIMIT 60`,
        sql`SELECT id::text,booked_on,description FROM finance_entries WHERE status='booked' ORDER BY booked_on DESC LIMIT 60`,
        sql`SELECT id::text,name FROM sponsors WHERE deleted_at IS NULL ORDER BY name`,
        sql`SELECT DISTINCT category FROM documents WHERE deleted_at IS NULL ORDER BY category`,
      ])
    : [[], [{ total: 0, active_view: 0, minutes: 0, contracts: 0, review: 0, archived: 0 }], [], [], [], [], [], []];

  const c = counts[0] ?? {};
  const views = [
    ["active", "Aktiv", Number(c.active_view ?? 0)],
    ["review", "Zu prüfen", Number(c.review ?? 0)],
    ["contracts", "Verträge", Number(c.contracts ?? 0)],
    ["all", "Alle", Number(c.total ?? 0)],
  ] as const;

  return (
    <div className={page}>
      <VdcPageHeader
        eyebrow="Vorstandsarbeit"
        title="Dokumente"
        description="Satzung, Protokolle, Verträge und Vereinsunterlagen mit Fristen und Verknüpfungen verwalten."
        actions={<Link href="/archiv" className={secondaryLink}><Archive size={15} /> Archiv · {Number(c.archived ?? 0)}</Link>}
      />

      {params.error && <div className={[feedback, feedbackError].join(" ")}>{errorLabels[params.error] ?? "Das Dokument konnte nicht gespeichert werden."}</div>}
      {(params.created || params.archived || params.uploaded || params.deleted) && (
        <div className={[feedback, feedbackSuccess].join(" ")}>
          {params.uploaded ? "Datei wurde sicher hochgeladen und im Dokumentenregister gespeichert." : params.deleted ? "Dokument wurde in den Papierkorb verschoben." : "Dokumentenregister wurde aktualisiert."}
        </div>
      )}

      <nav className={tabs} aria-label="Dokumente filtern">
        {views.map(([key, label, value]) => (
          <Link
            href={key === "active" ? "/dokumente" : "/dokumente?view=" + key}
            className={[tab, view === key ? tabActive : "", key === "review" && view === key ? tabWarning : ""].join(" ")}
            key={key}
          >
            <span>{label}</span><span className={count}>{value}</span>
          </Link>
        ))}
      </nav>

      <section className={vdcStatGrid}>
        <VdcStat label="Dokumente" value={Number(c.total ?? 0)} note="aktive Ablage" />
        <VdcStat label="Protokolle" value={Number(c.minutes ?? 0)} note="registriert" />
        <VdcStat label="Verträge" value={Number(c.contracts ?? 0)} note="aktiv" />
        <VdcStat label="Zu prüfen" value={Number(c.review ?? 0)} note="Status oder Frist" accent={Number(c.review ?? 0) > 0 ? "brand" : undefined} />
      </section>

      <details className={filterDrawer} open={Boolean(q || category || status)}>
        <summary>
          <div className={css({ display: "flex", alignItems: "center", gap: "2" })}><Filter size={15} /><strong>Suche & Feinfilter</strong></div>
          <VdcBadge>{q || category || status ? "Filter aktiv" : "Optional"}</VdcBadge>
        </summary>
        <form method="get" className={filterForm}>
          <input type="hidden" name="view" value={view} />
          <label className={field}>Suche<input className={control} name="q" defaultValue={q} placeholder="Titel oder Notiz" /></label>
          <label className={field}>Kategorie
            <select className={control} name="category" defaultValue={category}>
              <option value="">Alle</option>
              {categories.map((row) => <option key={String(row.category)} value={String(row.category)}>{String(row.category)}</option>)}
            </select>
          </label>
          <label className={field}>Status
            <select className={control} name="status" defaultValue={status}>
              <option value="">Alle</option><option value="draft">Entwurf</option><option value="active">Aktiv</option><option value="review">Zu prüfen</option><option value="expired">Abgelaufen</option>
            </select>
          </label>
          <VdcButton type="submit" visual="outline" size="sm">Filtern</VdcButton>
          {(q || category || status) && <Link href={view === "active" ? "/dokumente" : "/dokumente?view=" + view} className={actionLink}>Zurücksetzen</Link>}
        </form>
      </details>

      {canWrite && (
        <details className={createDrawer}>
          <summary>
            <div className={css({ display: "flex", alignItems: "center", gap: "2" })}><Plus size={16} /><strong>Dokument registrieren</strong></div>
            <VdcBadge tone="brand">Neu</VdcBadge>
          </summary>
          <form action={createDocumentAction} className={createForm} encType="multipart/form-data">
            <label className={field}>Titel<input className={control} name="title" required /></label>
            <label className={field}>Kategorie
              <select className={control} name="category" defaultValue="Allgemein">
                {["Allgemein","Protokoll","Vertrag","Finanzen","Satzung","Sponsor","Mitglied","Angebot"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <div className={uploadBox}>
              <div className={css({ display: "flex", alignItems: "center", gap: "2", color: "brand.hover", fontWeight: "850", fontSize: "xs" })}><Upload size={15} /> Datei hochladen</div>
              <label className={field}>Datei
                <input className={control} name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.jpg,.jpeg,.png,.webp" />
              </label>
              <small className={css({ color: "fg.muted", fontSize: "[10px]" })}>Max. 4 MB · PDF, Office, OpenDocument, TXT und gängige Bilder.</small>
            </div>

            <div className={divider}>ODER</div>
            <label className={[field, wide].join(" ")}>Externer Link<input className={control} name="storageRef" type="url" placeholder="https://…" /></label>
            <label className={field}>Dokumentdatum<input className={control} name="documentDate" type="date" /></label>
            <label className={field}>Prüfen am<input className={control} name="reviewOn" type="date" /></label>
            <label className={field}>Gültig bis<input className={control} name="validUntil" type="date" /></label>
            <label className={field}>Mitglied
              <select className={control} name="memberId" defaultValue="">
                <option value="">Keine Zuordnung</option>
                {members.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.first_name)} {String(m.last_name)}</option>)}
              </select>
            </label>
            <label className={field}>Sponsor
              <select className={control} name="sponsorId" defaultValue="">
                <option value="">Keine Zuordnung</option>
                {sponsors.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
              </select>
            </label>
            <label className={field}>Sitzung
              <select className={control} name="meetingId" defaultValue="">
                <option value="">Keine Zuordnung</option>
                {meetings.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.title)} · {formatDate(m.starts_at)}</option>)}
              </select>
            </label>
            <label className={field}>Beschluss
              <select className={control} name="resolutionId" defaultValue="">
                <option value="">Keine Zuordnung</option>
                {resolutions.map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.resolution_number ?? "")} {String(r.title)}</option>)}
              </select>
            </label>
            <label className={field}>Finanzbuchung
              <select className={control} name="financeEntryId" defaultValue="">
                <option value="">Keine Zuordnung</option>
                {financeEntries.map((entry) => <option key={String(entry.id)} value={String(entry.id)}>{formatDate(entry.booked_on)} · {String(entry.description)}</option>)}
              </select>
            </label>
            <label className={[field, wide].join(" ")}>Notiz<textarea className={control} name="notes" rows={3} /></label>
            <div className={submitRow}><VdcButton type="submit"><FileText size={15} /> Dokument speichern</VdcButton></div>
          </form>
        </details>
      )}

      <VdcCard padding="md">
        <div className={sectionHead}>
          <div><span className={eyebrow}>Ablage</span><h2>Dokumentenregister</h2></div>
          <VdcBadge tone="brand">{documents.length}</VdcBadge>
        </div>

        {documents.length === 0 ? (
          <VdcEmptyState title="Keine Dokumente für diesen Filter" />
        ) : (
          <div className={list}>
            {documents.map((doc) => {
              const isMeetingMinutes = doc.category === "Protokoll" && Boolean(doc.meeting_id);
              const primaryHref = isMeetingMinutes ? "/sitzungen/" + String(doc.meeting_id) + "/protokoll" : "/dokumente/" + String(doc.id);
              return (
                <article className={[docCard, isMeetingMinutes ? systemDoc : ""].join(" ")} key={String(doc.id)}>
                  <span className={icon}><FolderOpen size={18} /></span>
                  <div className={main}>
                    <div className={titleRow}>
                      <Link href={primaryHref} className={titleLink}>{String(doc.title)}</Link>
                      <div className={metaBadges}>
                        <VdcBadge>v{Number(doc.current_version_number ?? 1)}</VdcBadge>
                        <VdcBadge tone={statusTone(String(doc.status))}>{statusLabels[String(doc.status)] ?? String(doc.status)}</VdcBadge>
                        {isMeetingMinutes && <VdcBadge tone="brand">Systemgeführt</VdcBadge>}
                      </div>
                    </div>
                    <span>{String(doc.category)} · {doc.document_date ? formatDate(doc.document_date) : "angelegt " + formatDate(doc.created_at)}</span>

                    <div className={deadlineRow}>
                      {doc.review_on && <span className={chip}>Prüfen am {formatDate(doc.review_on)}</span>}
                      {doc.valid_until && <span className={chip}>Gültig bis {formatDate(doc.valid_until)}</span>}
                      {doc.storage_type === "upload" && doc.original_filename && <span className={chip}>Datei: {String(doc.original_filename)}{doc.file_size_bytes ? " · " + formatBytes(doc.file_size_bytes) : ""}</span>}
                    </div>

                    <div className={links}>
                      {doc.meeting_title && <span>Sitzung: {String(doc.meeting_title)}</span>}
                      {doc.agenda_title && <span>TOP {doc.agenda_position ? String(doc.agenda_position) : "–"}: {String(doc.agenda_title)}</span>}
                      {doc.resolution_number && <span>Beschluss: {String(doc.resolution_number)}</span>}
                      {doc.first_name && <span>Mitglied: {String(doc.first_name)} {String(doc.last_name)}</span>}
                      {doc.sponsor_name && <span>Sponsor: {String(doc.sponsor_name)}</span>}
                      {doc.finance_description && <span>Finanzen: {String(doc.finance_description)}</span>}
                    </div>
                    {doc.notes && <p>{String(doc.notes)}</p>}
                  </div>

                  <div className={actions}>
                    {isMeetingMinutes ? (
                      <>
                        <Link href={primaryHref} className={[actionLink, primaryAction].join(" ")}>Protokoll öffnen</Link>
                        <Link href={"/dokumente/" + String(doc.id)} className={actionLink}>Dokumentdetails</Link>
                      </>
                    ) : <Link href={"/dokumente/" + String(doc.id)} className={actionLink}>Details</Link>}

                    {doc.storage_ref && (
                      doc.storage_type === "upload"
                        ? <>
                            <Link href={"/api/documents/" + String(doc.id) + "/file"} target="_blank" className={actionLink}>Datei öffnen</Link>
                            <Link href={"/api/documents/" + String(doc.id) + "/file?download=1"} className={actionLink}>Download</Link>
                          </>
                        : doc.storage_type === "internal"
                          ? <Link href={String(doc.storage_ref)} className={actionLink}>Öffnen</Link>
                          : <a href={String(doc.storage_ref)} target="_blank" rel="noreferrer" className={actionLink}>Öffnen</a>
                    )}

                    {canWrite && !isMeetingMinutes && (
                      <>
                        <form action={updateDocumentStatusAction}>
                          <input type="hidden" name="id" value={String(doc.id)} />
                          <select name="status" defaultValue={String(doc.status)}>
                            <option value="active">Aktiv</option><option value="review">Zu prüfen</option><option value="expired">Abgelaufen</option>
                          </select>
                          <VdcButton type="submit" visual="ghost" size="sm">Status</VdcButton>
                        </form>
                        <form action={archiveDocumentAction}><input type="hidden" name="id" value={String(doc.id)} /><VdcButton type="submit" visual="ghost" size="sm">Archivieren</VdcButton></form>
                        <form action={moveToTrashAction}><input type="hidden" name="type" value="document" /><input type="hidden" name="id" value={String(doc.id)} /><ConfirmSubmitButton message={"Dokument „" + String(doc.title) + "“ in den Papierkorb verschieben?"}>Löschen</ConfirmSubmitButton></form>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </VdcCard>
    </div>
  );
}
