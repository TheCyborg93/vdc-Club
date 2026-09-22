import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Plus,
  Presentation,
  Users,
} from "lucide-react";
import { css } from "styled-system/css";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { createMeetingAction } from "@/app/sitzungen/actions";
import { meetingStatusLabel } from "@/lib/ui-labels";
import {
  VdcBadge,
  VdcButton,
  VdcCard,
  VdcEmptyState,
  VdcPageHeader,
  VdcStat,
  vdcStatGrid,
} from "@/components/ui";

const minutesStatusLabels:Record<string,string>={
  draft:"Entwurf",
  review:"In Prüfung",
  approved:"Freigegeben",
  archived:"Archiviert",
};

const modeLabels:Record<string,string>={
  in_person:"Präsenz",
  hybrid:"Hybrid",
  online:"Online",
};

const errors: Record<string, string> = {
  database: "Die Datenbankverbindung fehlt.",
  missing: "Titel und Startzeit sind erforderlich.",
  protected_delete: "Diese Sitzung enthält bereits Beschlüsse oder Dokumente bzw. ist abgeschlossen und kann nicht gelöscht werden.",
};

export const dynamic = "force-dynamic";

const page=css({display:"grid",gap:{base:"4",md:"5"}});
const newLink=css({
  display:"inline-flex",alignItems:"center",justifyContent:"center",gap:"2",minH:{base:"[44px]",md:"10"},px:"4",
  border:"1px solid",borderColor:"brand.solid",borderRadius:"l1",background:"brand.solid",
  color:"warmWhite",fontSize:"sm",fontWeight:"850",_hover:{background:"brand.hover",transform:"translateY(-1px)"},
});
const feedback=css({p:"3",border:"1px solid",borderRadius:"l2",fontSize:"xs",fontWeight:"750"});
const feedbackError=css({borderColor:"rgba(228,121,114,.24)",background:"rgba(228,121,114,.07)",color:"status.danger"});
const feedbackSuccess=css({borderColor:"rgba(143,198,162,.24)",background:"rgba(143,198,162,.07)",color:"status.success"});
const focusCard=css({
  display:"flex",flexDirection:{base:"column",md:"row"},alignItems:{md:"center"},justifyContent:"space-between",
  gap:"4",p:{base:"4",md:"5"},border:"1px solid",borderColor:"brand.border",borderRadius:"l4",
  background:"linear-gradient(135deg,rgba(196,51,30,.10),rgba(255,255,255,.01))",boxShadow:"md",
});
const focusCopy=css({
  minW:"0","& h2":{mt:"1.5",fontSize:{base:"xl",md:"2xl"},fontWeight:"950",letterSpacing:"-0.03em"},
  "& p":{mt:"1.5",color:"fg.muted",fontSize:"sm"},
});
const eyebrow=css({color:"brand.hover",fontSize:"[9px]",fontWeight:"900",letterSpacing:"0.13em",textTransform:"uppercase"});
const focusMeta=css({display:"flex",gap:"1.5",mt:"3",flexWrap:"wrap"});
const focusActions=css({display:"flex",flexDirection:{base:"row",md:"column"},alignItems:{md:"stretch"},gap:"2",flexWrap:"wrap"});
const primaryAction=css({
  display:"inline-flex",alignItems:"center",justifyContent:"center",minH:{base:"[44px]",md:"10"},px:"4",
  border:"1px solid",borderColor:"brand.solid",borderRadius:"l1",background:"brand.solid",
  color:"warmWhite",fontSize:"sm",fontWeight:"850",whiteSpace:"nowrap",_hover:{background:"brand.hover"},
});
const section=css({display:"grid",gap:"3"});
const sectionHead=css({
  display:"flex",alignItems:"center",justifyContent:"space-between",gap:"3",
  "& h2":{mt:"1",fontSize:"lg",fontWeight:"900"},
});
const list=css({display:"grid",gap:"2"});
const meetingCard=css({
  display:"grid",gridTemplateColumns:{base:"1fr",lg:"minmax(0,1fr) minmax(150px,.36fr) auto"},
  gap:"3",alignItems:"center",p:"3.5",border:"1px solid",borderColor:"surface.border",
  borderRadius:"l3",background:"surface.bg",transitionDuration:"normal",transitionProperty:"background, border-color, transform",
  _hover:{background:"surface.raised",borderColor:"brand.border",transform:"translateY(-1px)"},
});
const runningCard=css({borderColor:"brand.border",background:"brand.subtle"});
const completedCard=css({background:"surface.raised"});
const titleBlock=css({
  minW:"0","& strong":{display:"block",fontSize:"sm",fontWeight:"900"},
  "& > span":{display:"block",mt:"1",color:"fg.muted",fontSize:"[10px]",lineHeight:"1.45"},
});
const badges=css({display:"flex",gap:"1.5",mt:"2",flexWrap:"wrap"});
const progressBox=css({
  p:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l2",background:"surface.raised",
  "& > div:first-child":{display:"flex",justifyContent:"space-between",gap:"2",fontSize:"[10px]"},
  "& > div:first-child span":{color:"fg.muted"},"& > div:first-child strong":{fontWeight:"900"},
  "& > small":{display:"block",mt:"1",color:"fg.muted",fontSize:"[9px]"},
});
const track=css({h:"1.5",mt:"2",overflow:"hidden",borderRadius:"pill",background:"surface.hover"});
const range=css({h:"full",borderRadius:"pill",background:"brand.solid"});
const state=css({display:"flex",flexDirection:{base:"row",lg:"column"},alignItems:{lg:"flex-end"},gap:"1.5",flexWrap:"wrap"});
const createDrawer=css({
  overflow:"hidden",border:"1px solid",borderColor:"brand.border",borderRadius:"l3",background:"surface.bg",
  "& > summary":{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"3",p:"3.5",cursor:"pointer",listStyle:"none"},
  "& > summary::-webkit-details-marker":{display:"none"},
  "&[open] > summary":{borderBottom:"1px solid",borderColor:"surface.border",background:"brand.subtle"},
});
const createForm=css({
  display:"grid",gridTemplateColumns:{base:"1fr",md:"repeat(3,minmax(0,1fr))"},gap:"3",p:"3.5",
});
const field=css({display:"grid",gap:"1.5",color:"fg.muted",fontSize:"xs",fontWeight:"750"});
const wide=css({gridColumn:{md:"1 / -1"}});
const control=css({
  w:"full",minH:"10",px:"3",py:"2",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",
  background:"surface.bg",color:"fg",outline:"none",_focus:{borderColor:"brand.solid",boxShadow:"focus"},
});

function formatDateTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",day: "2-digit",month: "2-digit",year: "numeric",
    hour: "2-digit",minute: "2-digit",timeZone: "Europe/Berlin",
  }).format(date);
}

function readiness(row:Record<string,unknown>) {
  return [
    row.chair_member_id,row.minute_taker_member_id,row.invited_at,
    Boolean(String(row.invitation_method ?? "").trim()),row.invitation_timely!=null,
    row.agenda_sent_with_invitation!=null,Number(row.attendee_count ?? 0)>0,Number(row.agenda_count ?? 0)>0,
  ].filter(Boolean).length;
}

function meetingTone(status:unknown):"neutral"|"brand"|"success"|"warning"|"danger"|"info" {
  if (status==="running") return "brand";
  if (status==="planned") return "warning";
  if (status==="completed") return "success";
  return "neutral";
}

function minutesTone(status:string):"neutral"|"brand"|"success"|"warning"|"danger"|"info" {
  if (status==="archived") return "success";
  if (status==="review") return "warning";
  if (status==="draft") return "info";
  return "neutral";
}

function MeetingCard({meeting}:{meeting:Record<string,unknown>}) {
  const ready=readiness(meeting);
  const running=meeting.status==="running";
  const completed=meeting.status==="completed";
  const rawMinutesStatus=String(meeting.minutes_status ?? "draft");
  const displayMinutesStatus=rawMinutesStatus==="approved" ? "archived" : rawMinutesStatus;
  const href=completed ? `/sitzungen/${String(meeting.id)}/protokoll` : `/sitzungen/${String(meeting.id)}`;

  return (
    <Link href={href} className={[meetingCard,running ? runningCard : "",completed ? completedCard : ""].join(" ")}>
      <div className={titleBlock}>
        <strong>{String(meeting.title)}</strong>
        <span>{formatDateTime(meeting.starts_at)} · {meeting.location ? String(meeting.location) : "Ort offen"}</span>
        <div className={badges}>
          <VdcBadge>{modeLabels[String(meeting.meeting_mode)] ?? "Präsenz"}</VdcBadge>
          <VdcBadge>{Number(meeting.agenda_count ?? 0)} TOPs</VdcBadge>
          <VdcBadge>{Number(meeting.resolution_count ?? 0)} Beschlüsse</VdcBadge>
          <VdcBadge>{Number(meeting.attendee_count ?? 0)} Personen</VdcBadge>
        </div>
      </div>

      <div className={progressBox}>
        {completed ? (
          <>
            <div><span>Protokoll</span><strong>{minutesStatusLabels[displayMinutesStatus] ?? displayMinutesStatus}</strong></div>
            <small>{displayMinutesStatus==="archived" ? "Finale Fassung" : displayMinutesStatus==="review" ? "Wartet auf Freigabe" : "Nachbearbeitung offen"}</small>
          </>
        ) : (
          <>
            <div><span>Vorbereitung</span><strong>{ready}/8</strong></div>
            <div className={track}><div className={range} style={{width:Math.round((ready/8)*100)+"%"}}/></div>
          </>
        )}
      </div>

      <div className={state}>
        <VdcBadge tone={meetingTone(meeting.status)}>{meetingStatusLabel(meeting.status)}</VdcBadge>
        <VdcBadge tone={minutesTone(displayMinutesStatus)}>Protokoll · {minutesStatusLabels[displayMinutesStatus] ?? displayMinutesStatus}</VdcBadge>
      </div>
    </Link>
  );
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string }>;
}) {
  const actor = await requirePermission("meetings.read");
  const sql = getDb();
  const params = await searchParams;

  const [meetings, counts] = sql
    ? await Promise.all([
        sql`
          SELECT
            m.id::text,m.title,m.starts_at,m.location,m.status,m.minutes_status,m.meeting_mode,m.invited_at,
            m.invitation_method,m.chair_member_id::text,m.minute_taker_member_id::text,
            m.invitation_timely,m.agenda_sent_with_invitation,m.quorum_confirmed,
            count(DISTINCT ai.id)::int AS agenda_count,
            count(DISTINCT ai.id) FILTER (WHERE ai.status IN ('open','active'))::int AS open_agenda_count,
            count(DISTINCT r.id)::int AS resolution_count,
            count(DISTINCT ma.member_id)::int AS attendee_count
          FROM meetings m
          LEFT JOIN agenda_items ai ON ai.meeting_id=m.id
          LEFT JOIN resolutions r ON r.meeting_id=m.id
          LEFT JOIN meeting_attendees ma ON ma.meeting_id=m.id
          WHERE m.deleted_at IS NULL
          GROUP BY m.id
          ORDER BY
            CASE m.status WHEN 'running' THEN 0 WHEN 'planned' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
            CASE WHEN m.status IN ('running','planned') THEN m.starts_at END ASC,
            m.starts_at DESC
        `,
        sql`
          SELECT
            count(*) FILTER (WHERE status='planned' AND starts_at>=now())::int AS planned,
            count(*) FILTER (WHERE status='running')::int AS running,
            count(*) FILTER (WHERE EXTRACT(YEAR FROM starts_at)=EXTRACT(YEAR FROM CURRENT_DATE))::int AS year_count,
            (
              SELECT count(*)::int FROM agenda_items ai
              JOIN meetings mx ON mx.id=ai.meeting_id
              WHERE ai.status IN ('open','active') AND mx.deleted_at IS NULL
            ) AS open_agenda,
            (
              SELECT count(*)::int FROM resolutions
              WHERE EXTRACT(YEAR FROM decided_at)=EXTRACT(YEAR FROM CURRENT_DATE)
            ) AS resolutions,
            count(*) FILTER (WHERE status='completed' AND minutes_status='draft')::int AS minutes_open,
            count(*) FILTER (WHERE minutes_status='review')::int AS minutes_review
          FROM meetings
          WHERE deleted_at IS NULL
        `,
      ])
    : [[], [{ planned:0,running:0,year_count:0,open_agenda:0,resolutions:0,minutes_open:0,minutes_review:0 }]];

  const count=counts[0] ?? {};
  const canWrite=hasPermission(actor.roles,"meetings.write");
  const upcoming=meetings.filter((row)=>["planned","running"].includes(String(row.status)));
  const history=meetings.filter((row)=>!["planned","running"].includes(String(row.status)));
  const focus=upcoming.find((row)=>row.status==="running") ?? upcoming[0] ?? null;

  return (
    <div className={page}>
      <VdcPageHeader
        eyebrow="Vorstandsarbeit"
        title="Vorstandssitzungen"
        description="Vorbereiten, durchführen, beschließen und protokollieren – in einem durchgängigen Arbeitsablauf."
        actions={canWrite ? <a href="#neue-sitzung" className={newLink}><Plus size={15}/> Neue Sitzung</a> : undefined}
      />

      {params.error && <div className={[feedback,feedbackError].join(" ")}>{errors[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(params.created || params.deleted) && <div className={[feedback,feedbackSuccess].join(" ")}>{params.created ? "Sitzung wurde angelegt." : "Sitzung wurde in den Papierkorb verschoben."}</div>}

      <section className={vdcStatGrid}>
        <VdcStat label="Aktuell" value={Number(count.running ?? 0) ? "Live" : Number(count.planned ?? 0)} note={Number(count.running ?? 0) ? "Sitzung läuft" : "geplant"} accent={Number(count.running ?? 0) ? "brand" : undefined}/>
        <VdcStat label="Offene TOPs" value={Number(count.open_agenda ?? 0)} note="noch zu behandeln"/>
        <VdcStat label="Beschlüsse" value={Number(count.resolutions ?? 0)} note="dieses Jahr"/>
        <VdcStat label="Protokolle" value={Number(count.minutes_open ?? 0)+Number(count.minutes_review ?? 0)} note={Number(count.minutes_open ?? 0)+" Entwurf · "+Number(count.minutes_review ?? 0)+" in Prüfung"}/>
      </section>

      {focus && (
        <section className={focusCard}>
          <div className={focusCopy}>
            <span className={eyebrow}>{focus.status==="running" ? "Laufende Sitzung" : "Nächste Sitzung"}</span>
            <h2>{String(focus.title)}</h2>
            <p>{formatDateTime(focus.starts_at)} · {focus.location ? String(focus.location) : "Ort offen"}</p>
            <div className={focusMeta}>
              <VdcBadge>{modeLabels[String(focus.meeting_mode)] ?? "Präsenz"}</VdcBadge>
              <VdcBadge>{Number(focus.agenda_count ?? 0)} TOPs</VdcBadge>
              <VdcBadge>{Number(focus.attendee_count ?? 0)} Personen</VdcBadge>
              <VdcBadge tone={readiness(focus)===8 ? "success" : "warning"}>{readiness(focus)}/8 Vorbereitung</VdcBadge>
            </div>
          </div>
          <div className={focusActions}>
            <VdcBadge tone={meetingTone(focus.status)}>{meetingStatusLabel(focus.status)}</VdcBadge>
            <Link href={`/sitzungen/${String(focus.id)}`} className={primaryAction}>
              <Presentation size={15}/>{focus.status==="running" ? "Sitzung fortsetzen" : "Vorbereitung öffnen"}
            </Link>
          </div>
        </section>
      )}

      <section className={section}>
        <div className={sectionHead}>
          <div><span className={eyebrow}>Arbeitsbereich</span><h2>Kommend & laufend</h2></div>
          <VdcBadge tone="brand">{upcoming.length}</VdcBadge>
        </div>
        <div className={list}>
          {upcoming.length===0 ? <VdcEmptyState title="Keine kommende Vorstandssitzung geplant"/> : upcoming.map((meeting)=><MeetingCard key={String(meeting.id)} meeting={meeting}/>)}
        </div>
      </section>

      {canWrite && (
        <details className={createDrawer} id="neue-sitzung">
          <summary>
            <div className={css({display:"flex",alignItems:"center",gap:"2"})}><CalendarClock size={16}/><strong>Neue Vorstandssitzung anlegen</strong></div>
            <VdcBadge tone="brand">Planung</VdcBadge>
          </summary>
          <form action={createMeetingAction} className={createForm}>
            <label className={field}>Titel<input className={control} name="title" required placeholder="z. B. Vorstandssitzung Oktober"/></label>
            <label className={field}>Start<input className={control} name="startsAt" type="datetime-local" required/></label>
            <label className={field}>Ort<input className={control} name="location" placeholder="Vereinsheim"/></label>
            <label className={[field,wide].join(" ")}>Vorbereitung / Notiz<textarea className={control} name="notes" rows={3}/></label>
            <div className={wide}><VdcButton type="submit"><Plus size={15}/> Sitzung anlegen</VdcButton></div>
          </form>
        </details>
      )}

      <section className={section}>
        <div className={sectionHead}>
          <div><span className={eyebrow}>Archiv & Verlauf</span><h2>Abgeschlossen</h2></div>
          <VdcBadge>{history.length}</VdcBadge>
        </div>
        <div className={list}>
          {history.length===0 ? <VdcEmptyState title="Noch keine abgeschlossenen Sitzungen vorhanden"/> : history.map((meeting)=><MeetingCard key={String(meeting.id)} meeting={meeting}/>)}
        </div>
      </section>
    </div>
  );
}
