import Link from "next/link";
import { ArrowRight, ClipboardList, Plus, TriangleAlert } from "lucide-react";
import { css } from "styled-system/css";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  VdcBadge,
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
  closed: "Beendet",
  archived: "Archiviert",
};

const page = css({ display: "grid", gap: { base: "4", md: "5" } });
const primaryLink = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  minH: "10",
  px: "4",
  borderRadius: "l1",
  border: "1px solid",
  borderColor: "brand.solid",
  background: "brand.solid",
  color: "warmWhite",
  fontSize: "sm",
  fontWeight: "850",
  _hover: { background: "brand.hover", transform: "translateY(-1px)" },
});
const feedback = css({ p: "3", border: "1px solid", borderColor: "rgba(143,198,162,.24)", borderRadius: "l2", background: "rgba(143,198,162,.07)", color: "status.success", fontSize: "xs", fontWeight: "750" });
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
const tabCount = css({ display: "grid", placeItems: "center", minW: "6", h: "6", px: "1.5", borderRadius: "pill", background: "surface.hover", fontSize: "[10px]" });
const warning = css({
  display: "flex",
  flexDirection: { base: "column", sm: "row" },
  alignItems: { sm: "center" },
  gap: "3",
  p: "3.5",
  border: "1px solid",
  borderColor: "rgba(228,191,112,.24)",
  borderRadius: "l3",
  background: "rgba(228,191,112,.055)",
  "& svg": { flexShrink: "0", color: "status.warning" },
  "& strong": { display: "block", color: "status.warning", fontSize: "sm" },
  "& span": { display: "block", mt: "1", color: "fg.muted", fontSize: "xs", lineHeight: "1.45" },
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
const list = css({ display: "grid" });
const row = css({
  display: "grid",
  gridTemplateColumns: { base: "minmax(0,1fr)", md: "minmax(0,1fr) auto 18px" },
  gap: "3",
  alignItems: "center",
  py: "3",
  borderTop: "1px solid",
  borderColor: "surface.border",
  _first: { borderTop: "0" },
  _hover: { "& [data-survey-title]": { color: "brand.hover" } },
});
const main = css({
  minW: "0",
  "& > span": { display: "block", color: "brand.hover", fontSize: "[9px]", fontWeight: "850", textTransform: "uppercase", letterSpacing: "0.07em" },
  "& > strong": { display: "block", mt: "1", fontSize: "sm", fontWeight: "900", transitionDuration: "fast", transitionProperty: "color" },
  "& > small": { display: "block", mt: "1", color: "fg.muted", fontSize: "[10px]", lineHeight: "1.45" },
});
const meta = css({
  display: "flex",
  flexDirection: { base: "row", md: "column" },
  alignItems: { base: "center", md: "flex-end" },
  justifyContent: "space-between",
  gap: "1.5",
  flexWrap: "wrap",
  "& > small": { color: "fg.muted", fontSize: "[10px]" },
});
const arrow = css({ display: { base: "none", md: "block" }, color: "fg.subtle" });

function formatDate(value: unknown) {
  if (!value) return "Keine Frist";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Keine Frist";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function surveyTone(status: string, deadlinePassed: boolean): "neutral" | "brand" | "success" | "warning" | "danger" | "info" {
  if (deadlinePassed) return "danger";
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  if (status === "closed") return "info";
  return "neutral";
}

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; view?: string }>;
}) {
  const user = await requirePermission("surveys.read");
  const query = await searchParams;
  const sql = getDb();
  const canWrite = hasPermission(user.roles, "surveys.write");
  const view = ["active", "draft", "closed", "all"].includes(query.view ?? "") ? String(query.view) : "active";

  const surveys = sql ? await sql`
    SELECT
      s.id::text,s.title,s.topic,s.target_group,s.status,s.is_anonymous,s.ends_at,s.created_at,
      count(DISTINCT r.id)::int AS responses,
      count(DISTINCT q.id)::int AS questions
    FROM surveys s
    LEFT JOIN survey_responses r ON r.survey_id=s.id
    LEFT JOIN survey_questions q ON q.survey_id=s.id
    GROUP BY s.id
    ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END,s.created_at DESC
  ` : [];

  const active = surveys.filter((survey) => survey.status === "active").length;
  const drafts = surveys.filter((survey) => survey.status === "draft").length;
  const closed = surveys.filter((survey) => ["closed", "archived"].includes(String(survey.status))).length;
  const overdueActive = surveys.filter(
    (survey) => survey.status === "active" && survey.ends_at && new Date(String(survey.ends_at)).getTime() <= Date.now(),
  ).length;
  const responses = surveys.reduce((sum, survey) => sum + Number(survey.responses ?? 0), 0);
  const visibleSurveys = surveys.filter((survey) => {
    if (view === "all") return true;
    if (view === "active") return survey.status === "active";
    if (view === "draft") return survey.status === "draft";
    return ["closed", "archived"].includes(String(survey.status));
  });

  const views = [
    ["active", "Aktiv", active],
    ["draft", "Entwürfe", drafts],
    ["closed", "Beendet", closed],
    ["all", "Alle", surveys.length],
  ] as const;

  return (
    <div className={page}>
      <VdcPageHeader
        eyebrow="Organisation"
        title="Umfragen"
        description="Anonyme oder nicht anonyme Vereinsumfragen erstellen, verteilen und zentral auswerten."
        actions={canWrite ? <Link href="/umfragen/neu" className={primaryLink}><Plus size={15} /> Neue Umfrage</Link> : undefined}
      />

      <section className={vdcStatGrid}>
        <VdcStat label="Umfragen" value={surveys.length} note="gesamt" />
        <VdcStat label="Aktiv" value={active} note="öffentlich erreichbar" accent="brand" />
        <VdcStat label="Entwürfe" value={drafts} note="noch nicht veröffentlicht" />
        <VdcStat label="Antworten" value={responses} note="insgesamt eingegangen" />
      </section>

      {query.deleted && <div className={feedback}>Umfrage wurde endgültig gelöscht.</div>}

      <nav className={tabs} aria-label="Umfragen filtern">
        {views.map(([key, label, count]) => (
          <Link href={key === "active" ? "/umfragen" : "/umfragen?view=" + key} className={[tab, view === key ? tabActive : ""].join(" ")} key={key}>
            <span>{label}</span><span className={tabCount}>{count}</span>
          </Link>
        ))}
      </nav>

      {overdueActive > 0 && (
        <div className={warning}>
          <TriangleAlert size={18} />
          <div>
            <strong>{overdueActive} aktive Umfrage(n) mit abgelaufener Frist</strong>
            <span>Diese Umfragen nehmen öffentlich bereits keine Antworten mehr an und sollten formal beendet werden.</span>
          </div>
        </div>
      )}

      <VdcCard padding="md">
        <div className={sectionHead}>
          <div><span className={eyebrow}>Übersicht</span><h2>{view === "active" ? "Aktive Umfragen" : view === "draft" ? "Entwürfe" : view === "closed" ? "Beendet" : "Alle Umfragen"}</h2></div>
          <VdcBadge tone="brand">{visibleSurveys.length}</VdcBadge>
        </div>

        {visibleSurveys.length === 0 ? (
          <VdcEmptyState title="Keine Umfrage in dieser Ansicht" description="Neue oder vorhandene Umfragen erscheinen hier passend zum gewählten Status." />
        ) : (
          <div className={list}>
            {visibleSurveys.map((survey) => {
              const deadlinePassed = survey.status === "active" && Boolean(survey.ends_at) && new Date(String(survey.ends_at)).getTime() <= Date.now();
              return (
                <Link href={`/umfragen/${survey.id}`} className={row} key={String(survey.id)}>
                  <div className={main}>
                    <span>{String(survey.topic)} · {String(survey.target_group)}</span>
                    <strong data-survey-title>{String(survey.title)}</strong>
                    <small>{Number(survey.questions)} Fragen · {Number(survey.responses)} Antworten · {survey.is_anonymous ? "Anonym" : "Nicht anonym"}</small>
                  </div>
                  <div className={meta}>
                    <VdcBadge tone={surveyTone(String(survey.status), deadlinePassed)}>
                      {deadlinePassed ? "Frist abgelaufen" : statusLabels[String(survey.status)] ?? String(survey.status)}
                    </VdcBadge>
                    <small>{survey.ends_at ? "Bis " + formatDate(survey.ends_at) : "Ohne Frist"}</small>
                  </div>
                  <ArrowRight className={arrow} size={16} />
                </Link>
              );
            })}
          </div>
        )}
      </VdcCard>
    </div>
  );
}
