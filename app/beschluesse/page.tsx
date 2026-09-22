import Link from "next/link";
import {
  ArchiveRestore,
  CheckCircle2,
  Download,
  FileCheck2,
  Filter,
  ListTodo,
  Play,
} from "lucide-react";
import { css } from "styled-system/css";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  createResolutionTaskAction,
  updateResolutionImplementationAction,
  updateResolutionStatusAction,
} from "@/app/beschluesse/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { taskStatusLabel } from "@/lib/ui-labels";
import {
  VdcBadge,
  VdcButton,
  VdcCard,
  VdcEmptyState,
  VdcPageHeader,
  VdcStat,
  vdcStatGrid,
} from "@/components/ui";

const voteMethodLabels:Record<string,string>={
  open:"Offen",
  show_of_hands:"Handzeichen",
  roll_call:"Namentlich",
  secret:"Geheim",
  electronic:"Elektronisch",
};

const statusLabels:Record<string,string>={
  open:"Offen",
  in_progress:"In Umsetzung",
  implemented:"Umgesetzt",
  withdrawn:"Aufgehoben",
  rejected:"Abgelehnt",
};

const errorLabels:Record<string,string>={
  database:"Die Datenbank ist nicht verfügbar.",
  missing:"Der Beschluss wurde nicht gefunden.",
  withdrawn:"Ein aufgehobener Beschluss bleibt historisch abgeschlossen. Für eine neue Entscheidung bitte einen neuen Beschluss erfassen.",
  rejected:"Ein abgelehnter Antrag bleibt als Abstimmungsergebnis unveränderbar dokumentiert.",
  task_unavailable:"Es konnte keine Folgeaufgabe angelegt werden. Der Beschluss ist bereits abgeschlossen oder es existiert bereits eine aktive Folgeaufgabe.",
};

export const dynamic="force-dynamic";

const page=css({display:"grid",gap:{base:"4",md:"5"}});
const exportLink=css({
  display:"inline-flex",alignItems:"center",justifyContent:"center",gap:"2",minH:"10",px:"4",
  border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.raised",
  color:"fg",fontSize:"sm",fontWeight:"850",
  _hover:{borderColor:"brand.border",background:"surface.hover"},
});
const feedback=css({p:"3",border:"1px solid",borderRadius:"l2",fontSize:"xs",fontWeight:"750"});
const feedbackError=css({borderColor:"rgba(228,121,114,.24)",background:"rgba(228,121,114,.07)",color:"status.danger"});
const feedbackSuccess=css({borderColor:"rgba(143,198,162,.24)",background:"rgba(143,198,162,.07)",color:"status.success"});
const tabs=css({
  display:"grid",gridTemplateColumns:{base:"repeat(2,minmax(0,1fr))",md:"repeat(4,minmax(0,1fr))"},
  gap:"1",p:"1",border:"1px solid",borderColor:"surface.border",borderRadius:"l2",background:"surface.bg",
});
const tab=css({
  display:"flex",alignItems:"center",justifyContent:"space-between",gap:"2",minH:"9",px:"3",
  borderRadius:"l1",color:"fg.muted",fontSize:"xs",fontWeight:"800",
  _hover:{background:"surface.hover",color:"fg"},
});
const tabActive=css({background:"brand.subtle",color:"brand.hover"});
const tabWarning=css({background:"rgba(228,121,114,.07)",color:"status.danger"});
const tabCount=css({display:"grid",placeItems:"center",minW:"6",h:"6",px:"1.5",borderRadius:"pill",background:"surface.hover",fontSize:"[10px]"});
const filterDrawer=css({
  overflow:"hidden",border:"1px solid",borderColor:"surface.border",borderRadius:"l3",background:"surface.bg",
  "& > summary":{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"3",p:"3.5",cursor:"pointer",listStyle:"none"},
  "& > summary::-webkit-details-marker":{display:"none"},
  "&[open] > summary":{borderBottom:"1px solid",borderColor:"surface.border",background:"surface.raised"},
});
const filterForm=css({
  display:"grid",gridTemplateColumns:{base:"1fr",md:"minmax(0,1.7fr) minmax(130px,.6fr) minmax(150px,.7fr) auto auto"},
  gap:"2.5",alignItems:"end",p:"3.5",
});
const field=css({display:"grid",gap:"1.5",color:"fg.muted",fontSize:"xs",fontWeight:"750"});
const control=css({
  w:"full",minH:"10",px:"3",py:"2",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",
  background:"surface.bg",color:"fg",outline:"none",
  _focus:{borderColor:"brand.solid",boxShadow:"focus"},
});
const actionLink=css({
  display:"inline-flex",alignItems:"center",justifyContent:"center",gap:"1.5",minH:"8",px:"2.5",
  border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.bg",
  color:"fg.muted",fontSize:"xs",fontWeight:"800",
  _hover:{borderColor:"brand.border",color:"fg"},
});
const register=css({display:"grid",gap:"3"});
const resolutionCard=css({
  display:"grid",gridTemplateColumns:{base:"1fr",md:"[132px] minmax(0,1fr)"},
  overflow:"hidden",border:"1px solid",borderColor:"surface.border",borderRadius:"l3",background:"surface.bg",
});
const overdueCard=css({borderColor:"rgba(228,121,114,.25)",background:"linear-gradient(135deg,rgba(228,121,114,.04),rgba(23,23,26,1))"});
const numberSide=css({
  display:"grid",alignContent:"start",gap:"1.5",p:"3.5",borderBottom:{base:"1px solid",md:"0"},
  borderRight:{md:"1px solid"},borderColor:"surface.border",background:"surface.raised",
  "& span":{color:"fg.muted",fontSize:"[9px]",textTransform:"uppercase",letterSpacing:"0.08em"},
  "& strong":{fontSize:"sm",fontWeight:"950",color:"brand.hover",wordBreak:"break-word"},
  "& small":{color:"fg.subtle",fontSize:"[10px]"},
});
const body=css({display:"grid",gap:"3",p:{base:"3.5",md:"4"}});
const head=css({
  display:"flex",flexDirection:{base:"column",sm:"row"},justifyContent:"space-between",gap:"3",alignItems:{sm:"start"},
});
const titleBlock=css({
  minW:"0",
  "& h2":{fontSize:"lg",fontWeight:"900",lineHeight:"1.25"},
  "& a":{display:"inline-block",mt:"1.5",color:"brand.hover",fontSize:"[10px]",fontWeight:"750",_hover:{textDecoration:"underline"}},
});
const headStatus=css({display:"flex",gap:"1.5",alignItems:"center",flexWrap:"wrap"});
const decisionText=css({color:"fg.muted",fontSize:"sm",lineHeight:"1.65"});
const drawer=css({
  overflow:"hidden",border:"1px solid",borderColor:"surface.border",borderRadius:"l2",background:"surface.raised",
  "& > summary":{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"3",p:"2.5",cursor:"pointer",listStyle:"none"},
  "& > summary::-webkit-details-marker":{display:"none"},
  "& > summary strong":{display:"block",fontSize:"xs",fontWeight:"850"},
  "& > summary span":{display:"block",mt:"0.5",color:"fg.muted",fontSize:"[10px]"},
  "&[open] > summary":{borderBottom:"1px solid",borderColor:"surface.border"},
});
const drawerBody=css({p:"2.5"});
const metaGrid=css({
  display:"grid",gridTemplateColumns:{base:"repeat(2,minmax(0,1fr))",lg:"repeat(4,minmax(0,1fr))"},gap:"2",
});
const meta=css({
  p:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.bg",
  "& span":{display:"block",color:"fg.muted",fontSize:"[9px]",textTransform:"uppercase",letterSpacing:"0.05em"},
  "& strong":{display:"block",mt:"1",fontSize:"xs",fontWeight:"900"},
});
const note=css({mt:"2.5",p:"2.5",borderLeft:"3px solid",borderColor:"brand.solid",borderRadius:"0 l1 l1 0",background:"brand.subtle","& p":{mt:"1",color:"fg.muted",fontSize:"xs",lineHeight:"1.5"}});
const taskBox=css({
  display:"flex",flexDirection:{base:"column",sm:"row"},justifyContent:"space-between",alignItems:{sm:"center"},
  gap:"3",p:"3",border:"1px solid",borderColor:"brand.border",borderRadius:"l2",background:"brand.subtle",
  "& strong":{display:"block",mt:"1",fontSize:"xs",fontWeight:"900"},
  "& small":{display:"block",mt:"1",color:"fg.muted",fontSize:"[10px]",lineHeight:"1.4"},
});
const taskActions=css({display:"flex",gap:"1.5",alignItems:"center",flexWrap:"wrap"});
const form=css({display:"grid",gap:"2.5",p:"2.5"});
const formGrid=css({display:"grid",gridTemplateColumns:{base:"1fr",md:"repeat(2,minmax(0,1fr))"},gap:"2.5"});
const workflow=css({display:"flex",flexDirection:{base:"column",sm:"row"},alignItems:{sm:"center"},gap:"2",flexWrap:"wrap"});
const complete=css({
  display:"inline-flex",alignItems:"center",gap:"1.5",minH:"9",px:"3",
  border:"1px solid",borderColor:"rgba(143,198,162,.22)",borderRadius:"l1",
  background:"rgba(143,198,162,.07)",color:"status.success",fontSize:"xs",fontWeight:"850",
});
const more=css({
  marginLeft:{sm:"auto"},
  "& > summary":{cursor:"pointer",color:"fg.muted",fontSize:"xs",fontWeight:"800"},
  "& > div":{display:"flex",gap:"1.5",flexWrap:"wrap",mt:"2"},
});

function formatDate(value:unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Europe/Berlin"}).format(date);
}

function resolutionTone(status:string,outcome:unknown):"neutral"|"brand"|"success"|"warning"|"danger"|"info" {
  if (String(outcome)==="rejected") return "danger";
  if (status==="implemented") return "success";
  if (status==="in_progress") return "brand";
  if (status==="open") return "warning";
  if (status==="withdrawn") return "neutral";
  return "info";
}

function taskTone(status:unknown):"neutral"|"success"|"warning"|"danger"|"info" {
  if (status==="done") return "success";
  if (status==="in_progress") return "brand";
  if (status==="blocked") return "danger";
  return "warning";
}

export default async function ResolutionsPage({
  searchParams,
}:{
  searchParams:Promise<{error?:string;task?:string;saved?:string;q?:string;status?:string;year?:string;view?:string;}>;
}) {
  const actor=await requirePermission("resolutions.read");
  const sql=getDb();
  const params=await searchParams;

  const q=(params.q ?? "").trim();
  const status=["open","in_progress","implemented","withdrawn","rejected"].includes(params.status ?? "")
    ? String(params.status)
    : "";
  const yearNum=/^\d{4}$/.test(params.year ?? "") ? Number(params.year) : null;
  const requestedView=["active","overdue","implemented","all"].includes(params.view ?? "")
    ? String(params.view)
    : "active";
  const view=status ? "all" : requestedView;

  const [resolutions,counts,members,years]=sql
    ? await Promise.all([
        sql`
          SELECT
            r.id::text,r.resolution_number,r.title,r.decision_text,r.votes_yes,r.votes_no,r.votes_abstain,
            r.vote_method,r.vote_details,r.eligible_voters,r.excluded_voters,r.decision_outcome,r.status,
            r.decided_at,r.implemented_at,r.implementation_notes,
            m.id::text AS meeting_id,m.title AS meeting_title,m.status AS meeting_status,
            ai.position AS agenda_position,ai.title AS agenda_title,
            t.id::text AS task_id,t.title AS task_title,t.status AS task_status,t.due_date AS task_due_date,
            (t.due_date<CURRENT_DATE AND t.status IN ('open','in_progress','blocked')) AS task_overdue,
            owner.first_name AS owner_first_name,owner.last_name AS owner_last_name
          FROM resolutions r
          LEFT JOIN meetings m ON m.id=r.meeting_id
          LEFT JOIN agenda_items ai ON ai.id=r.agenda_item_id
          LEFT JOIN LATERAL (
            SELECT tx.*
            FROM tasks tx
            WHERE tx.source_type='resolution' AND tx.source_id=r.id AND tx.deleted_at IS NULL AND tx.status<>'cancelled'
            ORDER BY tx.created_at DESC
            LIMIT 1
          ) t ON true
          LEFT JOIN members owner ON owner.id=t.owner_member_id
          WHERE NOT (
            r.meeting_id IS NULL AND r.agenda_item_id IS NULL AND r.vote_method IS NULL
            AND r.decision_outcome IS NULL AND r.eligible_voters IS NULL
          )
          AND (${q}='' OR COALESCE(r.resolution_number,'') ILIKE '%' || ${q} || '%' OR r.title ILIKE '%' || ${q} || '%'
            OR r.decision_text ILIKE '%' || ${q} || '%' OR COALESCE(r.implementation_notes,'') ILIKE '%' || ${q} || '%')
          AND (
            ${status}=''
            OR (${status}='rejected' AND r.decision_outcome='rejected')
            OR (${status}<>'rejected' AND r.status=${status} AND COALESCE(r.decision_outcome,'accepted')<>'rejected')
          )
          AND (
            ${view}='all'
            OR (${view}='active' AND COALESCE(r.decision_outcome,'accepted')<>'rejected' AND r.status IN ('open','in_progress'))
            OR (${view}='overdue' AND COALESCE(r.decision_outcome,'accepted')<>'rejected' AND r.status IN ('open','in_progress')
              AND t.due_date<CURRENT_DATE AND t.status IN ('open','in_progress','blocked'))
            OR (${view}='implemented' AND (r.status IN ('implemented','withdrawn') OR r.decision_outcome='rejected'))
          )
          AND (${yearNum}::int IS NULL OR EXTRACT(YEAR FROM r.decided_at)::int=${yearNum}::int)
          ORDER BY
            CASE
              WHEN t.due_date<CURRENT_DATE AND t.status IN ('open','in_progress','blocked') THEN 0
              WHEN r.status='in_progress' THEN 1
              WHEN r.status='open' THEN 2
              ELSE 3
            END,
            t.due_date NULLS LAST,r.decided_at DESC,r.resolution_number DESC
        `,
        sql`
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE status='implemented' AND COALESCE(decision_outcome,'accepted')<>'rejected')::int AS implemented,
            count(*) FILTER (WHERE status='in_progress' AND COALESCE(decision_outcome,'accepted')<>'rejected')::int AS progress,
            count(*) FILTER (WHERE status='open' AND COALESCE(decision_outcome,'accepted')<>'rejected')::int AS open,
            count(*) FILTER (WHERE status='withdrawn' AND COALESCE(decision_outcome,'accepted')<>'rejected')::int AS withdrawn,
            count(*) FILTER (WHERE decision_outcome='rejected')::int AS rejected,
            count(*) FILTER (
              WHERE COALESCE(decision_outcome,'accepted')<>'rejected'
                AND status IN ('open','in_progress')
                AND EXISTS (
                  SELECT 1 FROM tasks tx
                  WHERE tx.source_type='resolution' AND tx.source_id=resolutions.id AND tx.deleted_at IS NULL
                    AND tx.status IN ('open','in_progress','blocked') AND tx.due_date<CURRENT_DATE
                )
            )::int AS overdue
          FROM resolutions
          WHERE NOT (
            meeting_id IS NULL AND agenda_item_id IS NULL AND vote_method IS NULL
            AND decision_outcome IS NULL AND eligible_voters IS NULL
          )
          AND (${q}='' OR COALESCE(resolution_number,'') ILIKE '%' || ${q} || '%' OR title ILIKE '%' || ${q} || '%'
            OR decision_text ILIKE '%' || ${q} || '%' OR COALESCE(implementation_notes,'') ILIKE '%' || ${q} || '%')
          AND (${yearNum}::int IS NULL OR EXTRACT(YEAR FROM decided_at)::int=${yearNum}::int)
        `,
        sql`SELECT id::text,first_name,last_name FROM members WHERE status='active' ORDER BY last_name,first_name`,
        sql`
          SELECT DISTINCT EXTRACT(YEAR FROM decided_at)::int AS year
          FROM resolutions
          WHERE NOT (meeting_id IS NULL AND agenda_item_id IS NULL AND vote_method IS NULL AND decision_outcome IS NULL AND eligible_voters IS NULL)
          ORDER BY year DESC
        `,
      ])
    : [[],[{total:0,implemented:0,progress:0,open:0,withdrawn:0,rejected:0,overdue:0}],[],[]];

  const count=counts[0] ?? {};
  const canWrite=hasPermission(actor.roles,"resolutions.write");
  const canCreateTasks=hasPermission(actor.roles,"tasks.write");
  const views=[
    ["active","Aktiv",Number(count.open ?? 0)+Number(count.progress ?? 0)],
    ["overdue","Überfällig",Number(count.overdue ?? 0)],
    ["implemented","Abgeschlossen",Number(count.implemented ?? 0)+Number(count.withdrawn ?? 0)+Number(count.rejected ?? 0)],
    ["all","Alle",Number(count.total ?? 0)],
  ] as const;

  return (
    <div className={page}>
      <VdcPageHeader
        eyebrow="Organisation"
        title="Beschlüsse"
        description="Beschlussbuch mit Abstimmung, Herkunft, Folgeaufgabe und dokumentierter Umsetzung."
        actions={<a href="/api/export/beschluesse" className={exportLink}><Download size={15}/> CSV Export</a>}
      />

      {params.error && <div className={[feedback,feedbackError].join(" ")}>{errorLabels[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(params.task || params.saved) && <div className={[feedback,feedbackSuccess].join(" ")}>{params.task ? "Folgeaufgabe wurde angelegt." : "Beschluss wurde aktualisiert."}</div>}

      <nav className={tabs} aria-label="Beschlüsse filtern">
        {views.map(([key,label,value])=>(
          <Link
            href={key==="active" ? "/beschluesse" : "/beschluesse?view="+key}
            className={[tab,view===key ? tabActive : "",key==="overdue" && view===key ? tabWarning : ""].join(" ")}
            key={key}
          >
            <span>{label}</span><span className={tabCount}>{value}</span>
          </Link>
        ))}
      </nav>

      <section className={vdcStatGrid}>
        <VdcStat label="Beschlüsse" value={Number(count.total ?? 0)} note={yearNum ? "im Jahr "+String(yearNum) : "im gewählten Bereich"} />
        <VdcStat label="Umgesetzt" value={Number(count.implemented ?? 0)} note="abgeschlossen" />
        <VdcStat label="In Umsetzung" value={Number(count.progress ?? 0)} note="laufend" accent="brand" />
        <VdcStat label="Offen" value={Number(count.open ?? 0)} note="noch ohne Abschluss" />
      </section>

      <details className={filterDrawer} open={Boolean(q || yearNum || status)}>
        <summary>
          <div className={css({display:"flex",alignItems:"center",gap:"2"})}><Filter size={15}/><strong>Suche, Jahr & Status</strong></div>
          <VdcBadge>{q || yearNum || status ? "Filter aktiv" : "Optional"}</VdcBadge>
        </summary>
        <form method="get" className={filterForm}>
          <input type="hidden" name="view" value={view}/>
          <label className={field}>Suche<input className={control} name="q" defaultValue={q} placeholder="Nummer, Titel, Beschlusstext oder Umsetzungsnotiz"/></label>
          <label className={field}>Jahr
            <select className={control} name="year" defaultValue={yearNum ? String(yearNum) : ""}>
              <option value="">Alle Jahre</option>
              {years.map((row)=><option key={String(row.year)} value={String(row.year)}>{String(row.year)}</option>)}
            </select>
          </label>
          <label className={field}>Status
            <select className={control} name="status" defaultValue={status}>
              <option value="">Alle Status</option>
              <option value="open">Offen</option><option value="in_progress">In Umsetzung</option>
              <option value="implemented">Umgesetzt</option><option value="withdrawn">Aufgehoben</option><option value="rejected">Abgelehnt</option>
            </select>
          </label>
          <VdcButton type="submit" visual="outline" size="sm">Filtern</VdcButton>
          {(q || yearNum || status) && <Link href={view==="active" ? "/beschluesse" : "/beschluesse?view="+view} className={actionLink}>Zurücksetzen</Link>}
        </form>
      </details>

      <section className={register}>
        {resolutions.length===0 ? (
          <VdcCard padding="md"><VdcEmptyState title="Keine Beschlüsse für diesen Filter" /></VdcCard>
        ) : resolutions.map((resolution)=>(
          <article className={[resolutionCard,resolution.task_overdue ? overdueCard : ""].join(" ")} key={String(resolution.id)}>
            <div className={numberSide}>
              <span>Beschluss</span>
              <strong>{resolution.resolution_number ? String(resolution.resolution_number) : "ohne Nr."}</strong>
              <small>{formatDate(resolution.decided_at)}</small>
            </div>

            <div className={body}>
              <div className={head}>
                <div className={titleBlock}>
                  <h2>{String(resolution.title)}</h2>
                  {resolution.meeting_id && (
                    <Link href={resolution.meeting_status==="completed" ? "/sitzungen/"+String(resolution.meeting_id)+"/protokoll" : "/sitzungen/"+String(resolution.meeting_id)}>
                      {String(resolution.meeting_title)}{resolution.agenda_position ? " · TOP "+String(resolution.agenda_position) : ""}
                    </Link>
                  )}
                </div>
                <div className={headStatus}>
                  {resolution.task_overdue && <VdcBadge tone="danger">Überfällig</VdcBadge>}
                  <VdcBadge tone={resolutionTone(String(resolution.status),resolution.decision_outcome)}>
                    {resolution.decision_outcome==="rejected" ? "Abgelehnt" : statusLabels[String(resolution.status)] ?? String(resolution.status)}
                  </VdcBadge>
                </div>
              </div>

              <p className={decisionText}>{String(resolution.decision_text)}</p>

              <details className={drawer}>
                <summary>
                  <div><strong>Beschlussdetails</strong><span>Abstimmung, Stimmen & Umsetzungsnotiz</span></div>
                  <VdcBadge>Details</VdcBadge>
                </summary>
                <div className={drawerBody}>
                  <div className={metaGrid}>
                    <div className={meta}><span>Ergebnis</span><strong>{resolution.decision_outcome==="accepted" ? "Angenommen" : resolution.decision_outcome==="rejected" ? "Abgelehnt" : "–"}</strong></div>
                    <div className={meta}><span>Stimmberechtigt</span><strong>{Number(resolution.eligible_voters ?? 0)}</strong></div>
                    <div className={meta}><span>Ausgeschlossen</span><strong>{Number(resolution.excluded_voters ?? 0)}</strong></div>
                    <div className={meta}><span>Ja</span><strong>{Number(resolution.votes_yes)}</strong></div>
                    <div className={meta}><span>Nein</span><strong>{Number(resolution.votes_no)}</strong></div>
                    <div className={meta}><span>Enthaltung</span><strong>{Number(resolution.votes_abstain)}</strong></div>
                    <div className={meta}><span>Abstimmungsart</span><strong>{voteMethodLabels[String(resolution.vote_method)] ?? "–"}</strong></div>
                    <div className={meta}><span>Umgesetzt am</span><strong>{resolution.implemented_at ? formatDate(resolution.implemented_at) : "–"}</strong></div>
                  </div>
                  {resolution.vote_details && <div className={note}><span className={css({color:"brand.hover",fontSize:"[9px]",fontWeight:"900",textTransform:"uppercase"})}>Namentliche Abstimmung</span><p>{String(resolution.vote_details)}</p></div>}
                  {resolution.implementation_notes && <div className={note}><span className={css({color:"brand.hover",fontSize:"[9px]",fontWeight:"900",textTransform:"uppercase"})}>Umsetzungsnotiz</span><p>{String(resolution.implementation_notes)}</p></div>}
                </div>
              </details>

              {resolution.task_id ? (
                <div className={taskBox}>
                  <div>
                    <span className={css({color:"brand.hover",fontSize:"[9px]",fontWeight:"900",textTransform:"uppercase"})}>Folgeaufgabe</span>
                    <strong>{String(resolution.task_title)}</strong>
                    <small>
                      {resolution.owner_first_name ? String(resolution.owner_first_name)+" "+String(resolution.owner_last_name) : "Nicht zugewiesen"}
                      {resolution.task_due_date ? " · Frist "+formatDate(resolution.task_due_date) : ""}
                    </small>
                  </div>
                  <div className={taskActions}>
                    <VdcBadge tone={taskTone(resolution.task_status)}>{taskStatusLabel(resolution.task_status)}</VdcBadge>
                    <Link href={resolution.task_overdue ? "/aufgaben?view=overdue" : "/aufgaben"} className={actionLink}>
                      <ListTodo size={14}/>{resolution.task_overdue ? "Überfällige Aufgabe öffnen" : "Aufgaben öffnen"}
                    </Link>
                  </div>
                </div>
              ) : canCreateTasks && resolution.decision_outcome!=="rejected" && !["implemented","withdrawn"].includes(String(resolution.status)) ? (
                <details className={drawer}>
                  <summary><div><strong>Folgeaufgabe anlegen</strong><span>Verantwortung und Frist direkt verknüpfen</span></div><VdcBadge tone="brand">Neu</VdcBadge></summary>
                  <form action={createResolutionTaskAction} className={form}>
                    <input type="hidden" name="resolutionId" value={String(resolution.id)}/>
                    <label className={field}>Titel<input className={control} name="title" defaultValue={"Beschluss umsetzen: "+String(resolution.title)} required/></label>
                    <label className={field}>Beschreibung<textarea className={control} name="description" rows={3} defaultValue={String(resolution.decision_text)}/></label>
                    <div className={formGrid}>
                      <label className={field}>Verantwortlich
                        <select className={control} name="ownerMemberId" defaultValue="">
                          <option value="">Noch offen</option>
                          {members.map((member)=><option key={String(member.id)} value={String(member.id)}>{String(member.first_name)} {String(member.last_name)}</option>)}
                        </select>
                      </label>
                      <label className={field}>Frist<input className={control} name="dueDate" type="date"/></label>
                    </div>
                    <VdcButton type="submit"><ListTodo size={15}/> Aufgabe anlegen</VdcButton>
                  </form>
                </details>
              ) : null}

              {canWrite && resolution.decision_outcome!=="rejected" && (
                <details className={drawer}>
                  <summary><div><strong>Umsetzungsnotiz</strong><span>Dokumentiere Ergebnis und Abschluss</span></div><VdcBadge>Bearbeiten</VdcBadge></summary>
                  <form action={updateResolutionImplementationAction} className={form}>
                    <input type="hidden" name="id" value={String(resolution.id)}/>
                    <label className={field}>Notiz
                      <textarea className={control} name="implementationNotes" rows={3} defaultValue={resolution.implementation_notes ? String(resolution.implementation_notes) : ""} placeholder="Was wurde umgesetzt, wann und mit welchem Ergebnis?"/>
                    </label>
                    <VdcButton type="submit" visual="outline" size="sm">Notiz speichern</VdcButton>
                  </form>
                </details>
              )}

              {canWrite && resolution.decision_outcome!=="rejected" && resolution.status!=="withdrawn" && (
                <div className={workflow}>
                  {resolution.status==="open" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)}/><input type="hidden" name="status" value="in_progress"/>
                      <VdcButton type="submit"><Play size={15}/> Umsetzung starten</VdcButton>
                    </form>
                  )}
                  {resolution.status==="in_progress" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)}/><input type="hidden" name="status" value="implemented"/>
                      <ConfirmSubmitButton message="Beschluss als vollständig umgesetzt markieren? Eine verknüpfte Folgeaufgabe wird ebenfalls erledigt.">
                        Als umgesetzt markieren
                      </ConfirmSubmitButton>
                    </form>
                  )}
                  {resolution.status==="implemented" && <span className={complete}><CheckCircle2 size={15}/> Umsetzung abgeschlossen</span>}
                  <details className={more}>
                    <summary>Weitere Aktionen</summary>
                    <div>
                      {resolution.status!=="open" && (
                        <form action={updateResolutionStatusAction}>
                          <input type="hidden" name="id" value={String(resolution.id)}/><input type="hidden" name="status" value="open"/>
                          <VdcButton type="submit" visual="ghost" size="sm"><ArchiveRestore size={14}/> Wieder öffnen</VdcButton>
                        </form>
                      )}
                      <form action={updateResolutionStatusAction}>
                        <input type="hidden" name="id" value={String(resolution.id)}/><input type="hidden" name="status" value="withdrawn"/>
                        <ConfirmSubmitButton message={"Beschluss „"+String(resolution.resolution_number ?? resolution.title)+"“ wirklich aufheben? Eine offene Folgeaufgabe wird abgebrochen."}>
                          Aufheben
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
