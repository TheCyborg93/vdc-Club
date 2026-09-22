import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ClipboardCheck,
  ReceiptText,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { css } from "styled-system/css";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { upsertBudgetAction } from "@/app/finanzen/actions";
import { FinanceNav } from "@/components/finance-nav";
import {
  VdcBadge,
  VdcButton,
  VdcCard,
  VdcEmptyState,
  VdcPageHeader,
  VdcStat,
  vdcStatGrid,
} from "@/components/ui";

export const dynamic="force-dynamic";

const euro=new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const money=(value:unknown)=>euro.format(Number(value ?? 0));
const formatDate=(value:unknown)=>{
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
};

const page=css({display:"grid",gap:{base:"4",md:"5"}});
const feedback=css({p:"3",border:"1px solid",borderRadius:"l2",fontSize:"xs",fontWeight:"750"});
const feedbackSuccess=css({borderColor:"rgba(143,198,162,.24)",background:"rgba(143,198,162,.07)",color:"status.success"});
const feedbackError=css({borderColor:"rgba(228,121,114,.24)",background:"rgba(228,121,114,.07)",color:"status.danger"});
const attention=css({
  display:"flex",flexDirection:{base:"column",md:"row"},alignItems:{md:"center"},justifyContent:"space-between",
  gap:"3",p:"3.5",border:"1px solid",borderColor:"rgba(228,121,114,.22)",borderRadius:"l3",
  background:"rgba(228,121,114,.045)",
});
const attentionCopy=css({
  "& strong":{display:"block",mt:"1",color:"status.danger",fontSize:"sm",fontWeight:"900"},
  "& small":{display:"block",mt:"1",color:"fg.muted",fontSize:"xs",lineHeight:"1.45"},
});
const eyebrow=css({color:"brand.hover",fontSize:"[9px]",fontWeight:"900",letterSpacing:"0.13em",textTransform:"uppercase"});
const attentionActions=css({display:"flex",gap:"2",flexWrap:"wrap"});
const primaryLink=css({
  display:"inline-flex",alignItems:"center",justifyContent:"center",minH:"10",px:"4",
  border:"1px solid",borderColor:"brand.solid",borderRadius:"l1",background:"brand.solid",
  color:"warmWhite",fontSize:"sm",fontWeight:"850",_hover:{background:"brand.hover"},
});
const outlineLink=css({
  display:"inline-flex",alignItems:"center",justifyContent:"center",minH:"10",px:"4",
  border:"1px solid",borderColor:"surface.border",borderRadius:"l1",background:"surface.raised",
  color:"fg",fontSize:"sm",fontWeight:"850",_hover:{borderColor:"brand.border",background:"surface.hover"},
});
const quickGrid=css({
  display:"grid",gridTemplateColumns:{base:"1fr",sm:"repeat(2,minmax(0,1fr))",xl:"repeat(4,minmax(0,1fr))"},gap:"2",
});
const quickLink=css({
  display:"grid",gap:"2",minH:"[126px]",p:"3.5",border:"1px solid",borderColor:"surface.border",
  borderRadius:"l3",background:"surface.bg",transitionDuration:"normal",transitionProperty:"background, border-color, transform",
  _hover:{background:"surface.raised",borderColor:"brand.border",transform:"translateY(-1px)"},
  "& svg":{color:"brand.hover"},"& span":{color:"fg.muted",fontSize:"[9px]",fontWeight:"850",textTransform:"uppercase",letterSpacing:"0.07em"},
  "& strong":{fontSize:"sm",fontWeight:"900"},"& small":{color:"fg.muted",fontSize:"[10px]",lineHeight:"1.45"},
});
const grid=css({display:"grid",gridTemplateColumns:{base:"1fr",xl:"repeat(2,minmax(0,1fr))"},gap:"3",alignItems:"start"});
const sectionHead=css({
  display:"flex",alignItems:"center",justifyContent:"space-between",gap:"3",mb:"3",
  "& h2":{mt:"1",fontSize:"lg",fontWeight:"900"},
});
const list=css({display:"grid"});
const entryRow=css({
  display:"grid",gridTemplateColumns:"[34px] minmax(0,1fr) auto",gap:"2.5",alignItems:"center",
  py:"2.5",borderTop:"1px solid",borderColor:"surface.border",_first:{borderTop:"0"},
});
const entryIcon=css({display:"grid",placeItems:"center",w:"8.5",h:"8.5",borderRadius:"pill",background:"surface.raised"});
const incomeIcon=css({color:"status.success"});
const expenseIcon=css({color:"status.danger"});
const entryMain=css({
  minW:"0","& strong":{display:"block",fontSize:"xs",fontWeight:"850"},
  "& span":{display:"block",mt:"1",color:"fg.muted",fontSize:"[10px]",lineHeight:"1.45"},
});
const entryAmount=css({fontSize:"xs",fontWeight:"900",whiteSpace:"nowrap"});
const negative=css({color:"status.danger"});
const positive=css({color:"status.success"});
const budgetList=css({display:"grid",gap:"2"});
const budgetRow=css({
  display:"grid",gap:"2",p:"2.5",border:"1px solid",borderColor:"surface.border",borderRadius:"l2",background:"surface.raised",
});
const overBudget=css({borderColor:"rgba(228,121,114,.22)",background:"rgba(228,121,114,.035)"});
const budgetHead=css({
  display:"flex",justifyContent:"space-between",gap:"3",alignItems:"start",
  "& strong":{display:"block",fontSize:"xs",fontWeight:"900"},"& span":{display:"block",mt:"1",color:"fg.muted",fontSize:"[10px]"},
});
const budgetMeta=css({display:"flex",justifyContent:"space-between",gap:"2",color:"fg.muted",fontSize:"[10px]",flexWrap:"wrap"});
const track=css({h:"2",overflow:"hidden",borderRadius:"pill",background:"surface.hover"});
const range=css({h:"full",borderRadius:"pill",background:"brand.solid"});
const rangeOver=css({background:"status.danger"});
const budgetDrawer=css({
  mt:"3",overflow:"hidden",border:"1px solid",borderColor:"surface.border",borderRadius:"l2",
  "& > summary":{p:"2.5",cursor:"pointer",listStyle:"none",color:"fg.muted",fontSize:"xs",fontWeight:"800"},
  "& > summary::-webkit-details-marker":{display:"none"},
  "&[open] > summary":{borderBottom:"1px solid",borderColor:"surface.border",color:"fg"},
});
const form=css({display:"grid",gap:"2.5",p:"2.5"});
const field=css({display:"grid",gap:"1.5",color:"fg.muted",fontSize:"xs",fontWeight:"750"});
const control=css({
  w:"full",minH:"10",px:"3",py:"2",border:"1px solid",borderColor:"surface.border",borderRadius:"l1",
  background:"surface.bg",color:"fg",outline:"none",_focus:{borderColor:"brand.solid",boxShadow:"focus"},
});

export default async function FinancePage({
  searchParams,
}:{
  searchParams:Promise<{budget?:string;error?:string}>;
}) {
  const user=await requirePermission("finance.read");
  const sql=getDb();
  const params=await searchParams;
  const canWrite=hasPermission(user.roles,"finance.write");
  const year=new Date().getFullYear();

  const [summaryRows,entries,budgets,feeRows]=sql ? await Promise.all([
    sql`
      SELECT
        COALESCE((SELECT SUM(amount) FROM finance_budgets WHERE fiscal_year=${year}),0) AS budget,
        COALESCE((SELECT SUM(amount) FROM finance_entries WHERE entry_type='income' AND status='booked' AND EXTRACT(YEAR FROM booked_on)=${year}),0) AS income,
        COALESCE((SELECT SUM(amount) FROM finance_entries WHERE entry_type='expense' AND status='booked' AND EXTRACT(YEAR FROM booked_on)=${year}),0) AS expense
    `,
    sql`
      SELECT f.id::text,f.entry_type,f.amount,f.category,f.description,f.booked_on,m.first_name,m.last_name
      FROM finance_entries f
      LEFT JOIN members m ON m.id=f.member_id
      WHERE f.status='booked'
      ORDER BY f.booked_on DESC,f.created_at DESC
      LIMIT 8
    `,
    sql`
      SELECT
        b.id::text,b.category,b.amount,b.notes,
        COALESCE((
          SELECT SUM(f.amount)
          FROM finance_entries f
          WHERE f.status='booked' AND f.entry_type='expense' AND f.category=b.category
            AND EXTRACT(YEAR FROM f.booked_on)=b.fiscal_year
        ),0) AS spent
      FROM finance_budgets b
      WHERE b.fiscal_year=${year}
      ORDER BY b.category
    `,
    sql`
      SELECT
        mf.id::text,mf.amount,mf.status,
        CASE
          WHEN mf.status='paid' AND COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0)=0
          THEN mf.amount
          ELSE COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0)
        END AS paid,
        CASE
          WHEN EXISTS (SELECT 1 FROM membership_fee_installments i WHERE i.fee_id=mf.id)
          THEN COALESCE((SELECT SUM(i.amount) FROM membership_fee_installments i WHERE i.fee_id=mf.id AND i.due_date<=CURRENT_DATE),0)
          WHEN mf.due_date IS NOT NULL AND mf.due_date<=CURRENT_DATE THEN mf.amount
          ELSE 0
        END AS due_total
      FROM membership_fees mf
      WHERE mf.fiscal_year=${year} AND mf.status<>'cancelled'
    `,
  ]) : [[{budget:0,income:0,expense:0}],[],[],[]];

  const s=summaryRows[0] ?? {};
  const income=Number(s.income ?? 0);
  const expense=Number(s.expense ?? 0);
  const balance=income-expense;
  const budget=Number(s.budget ?? 0);
  const budgetRemaining=budget-expense;

  const contributionExpected=feeRows.filter((fee)=>String(fee.status)!=="exempt").reduce((sum,fee)=>sum+Number(fee.amount ?? 0),0);
  const contributionPaid=feeRows.reduce((sum,fee)=>sum+Number(fee.paid ?? 0),0);
  const contributionOpen=Math.max(0,contributionExpected-contributionPaid);
  const overdueCount=feeRows.filter((fee)=>{
    if (["paid","exempt","cancelled"].includes(String(fee.status))) return false;
    return Number(fee.due_total ?? 0)>Number(fee.paid ?? 0)+0.001;
  }).length;

  const links=[
    {href:"/finanzen/beitraege",label:"Mitgliedsbeiträge",value:money(contributionOpen)+" offen",note:money(contributionPaid)+" von "+money(contributionExpected)+" eingegangen",Icon:UsersRound},
    {href:"/finanzen/offene-beitraege",label:"Handlungsbedarf",value:overdueCount+" überfällig",note:"Offene und fällige Beiträge prüfen",Icon:ClipboardCheck},
    {href:"/finanzen/beitragsarten",label:"Beitragsmodelle",value:"Beitragsarten",note:"Standard, Jugend, Ermäßigt und individuelle Modelle",Icon:WalletCards},
    {href:"/finanzen/auswertung",label:"Jahresauswertung",value:String(year),note:"Einzugsquote und Beitragsverteilung ansehen",Icon:BarChart3},
  ];

  return (
    <div className={page}>
      <VdcPageHeader
        eyebrow="Finanzen"
        title="Finanzübersicht"
        description="Vereinsfinanzen, Budgets und Mitgliedsbeiträge auf einen Blick."
      />

      <FinanceNav active="overview"/>

      {params.budget && <div className={[feedback,feedbackSuccess].join(" ")}>Budget wurde gespeichert.</div>}
      {params.error && <div className={[feedback,feedbackError].join(" ")}>Die Eingaben konnten nicht verarbeitet werden.</div>}

      <section className={vdcStatGrid}>
        <VdcStat label="Einnahmen" value={money(income)} note={String(year)} />
        <VdcStat label="Ausgaben" value={money(expense)} note={String(year)} />
        <VdcStat label="Saldo" value={money(balance)} note="Einnahmen minus Ausgaben" accent={balance<0 ? "danger" : undefined}/>
        <VdcStat label="Budgetrest" value={money(budgetRemaining)} note="Plan minus Ausgaben" accent={budgetRemaining<0 ? "danger" : undefined}/>
      </section>

      {(overdueCount>0 || budgetRemaining<0) && (
        <section className={attention}>
          <div className={attentionCopy}>
            <span className={eyebrow}>Handlungsbedarf</span>
            <strong>{overdueCount>0 ? overdueCount+" überfällige Beitragsfälle" : "Budget überschritten"}</strong>
            <small>
              {overdueCount>0 && budgetRemaining<0
                ? "Zusätzlich liegt der Gesamtaufwand über dem hinterlegten Budget."
                : overdueCount>0
                  ? "Offene und fällige Mitgliedsbeiträge sollten geprüft werden."
                  : "Die gebuchten Ausgaben liegen über dem hinterlegten Gesamtbudget."}
            </small>
          </div>
          <div className={attentionActions}>
            {overdueCount>0 && <Link href="/finanzen/offene-beitraege" className={primaryLink}>Offene Beiträge prüfen</Link>}
            {budgetRemaining<0 && <a href="#budget" className={outlineLink}>Budget prüfen</a>}
          </div>
        </section>
      )}

      <section className={quickGrid}>
        {links.map(({href,label,value,note,Icon})=>(
          <Link href={href} className={quickLink} key={href}>
            <Icon size={18}/>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </Link>
        ))}
      </section>

      <section className={grid}>
        <VdcCard padding="md">
          <div className={sectionHead}>
            <div><span className={eyebrow}>Buchungen</span><h2>Letzte Bewegungen</h2></div>
            <Link href="/finanzen/buchungen" className={outlineLink}><ReceiptText size={14}/> Alle Buchungen</Link>
          </div>

          {entries.length===0 ? (
            <VdcEmptyState title="Noch keine Buchungen vorhanden" />
          ) : (
            <div className={list}>
              {entries.map((entry)=>(
                <div className={entryRow} key={String(entry.id)}>
                  <span className={[entryIcon,entry.entry_type==="income" ? incomeIcon : expenseIcon].join(" ")}>
                    {entry.entry_type==="income" ? <ArrowUpRight size={15}/> : <ArrowDownRight size={15}/>}
                  </span>
                  <div className={entryMain}>
                    <strong>{String(entry.description)}</strong>
                    <span>{String(entry.category)} · {formatDate(entry.booked_on)}{entry.first_name ? " · "+entry.first_name+" "+entry.last_name : ""}</span>
                  </div>
                  <b className={[entryAmount,entry.entry_type==="expense" ? negative : positive].join(" ")}>
                    {entry.entry_type==="expense" ? "−" : "+"}{money(entry.amount)}
                  </b>
                </div>
              ))}
            </div>
          )}
        </VdcCard>

        <VdcCard padding="md" id="budget">
          <div className={sectionHead}>
            <div><span className={eyebrow}>Budget</span><h2>Bereiche {year}</h2></div>
            <VdcBadge tone={budgetRemaining<0 ? "danger" : "brand"}>{money(budgetRemaining)} Rest</VdcBadge>
          </div>

          {budgets.length===0 ? (
            <VdcEmptyState title="Noch keine Budgets hinterlegt" />
          ) : (
            <div className={budgetList}>
              {budgets.map((item)=>{
                const planned=Number(item.amount ?? 0);
                const spent=Number(item.spent ?? 0);
                const remaining=planned-spent;
                const progress=planned>0 ? Math.min(100,Math.round((spent/planned)*100)) : spent>0 ? 100 : 0;
                return (
                  <div className={[budgetRow,remaining<0 ? overBudget : ""].join(" ")} key={String(item.id)}>
                    <div className={budgetHead}>
                      <div><strong>{String(item.category)}</strong><span>{String(item.notes || "Ohne Notiz")}</span></div>
                      <VdcBadge tone={remaining<0 ? "danger" : "neutral"}>{money(remaining)} Rest</VdcBadge>
                    </div>
                    <div className={budgetMeta}><span>{money(spent)} verbraucht</span><span>{money(planned)} geplant</span></div>
                    <div className={track}><div className={[range,remaining<0 ? rangeOver : ""].join(" ")} style={{width:progress+"%"}}/></div>
                  </div>
                );
              })}
            </div>
          )}

          {canWrite && (
            <details className={budgetDrawer}>
              <summary>Budget anlegen oder anpassen</summary>
              <form action={upsertBudgetAction} className={form}>
                <input type="hidden" name="year" value={year}/>
                <label className={field}>Bereich<input className={control} name="category" required placeholder="z. B. Turniere"/></label>
                <label className={field}>Betrag<input className={control} name="amount" inputMode="decimal" required/></label>
                <label className={field}>Notiz<input className={control} name="notes"/></label>
                <VdcButton type="submit">Budget speichern</VdcButton>
              </form>
            </details>
          )}
        </VdcCard>
      </section>
    </div>
  );
}
