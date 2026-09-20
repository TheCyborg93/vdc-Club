import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { upsertBudgetAction } from "@/app/finanzen/actions";
import { FinanceNav } from "@/components/finance-nav";

export const dynamic="force-dynamic";

const euro=new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const money=(value:unknown)=>euro.format(Number(value ?? 0));
const formatDate=(value:unknown)=>{
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
};

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
      SELECT
        f.id::text,f.entry_type,f.amount,f.category,f.description,f.booked_on,
        m.first_name,m.last_name
      FROM finance_entries f
      LEFT JOIN members m ON m.id=f.member_id
      WHERE f.status='booked'
      ORDER BY f.booked_on DESC,f.created_at DESC
      LIMIT 8
    `,
    sql`
      SELECT id::text,category,amount,notes
      FROM finance_budgets
      WHERE fiscal_year=${year}
      ORDER BY category
    `,
    sql`
      SELECT
        mf.id::text,mf.amount,mf.status,
        CASE
          WHEN mf.status='paid'
            AND COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0)=0
          THEN mf.amount
          ELSE COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0)
        END AS paid,
        COALESCE((SELECT SUM(i.amount) FROM membership_fee_installments i WHERE i.fee_id=mf.id AND i.due_date<=CURRENT_DATE),0) AS due_total
      FROM membership_fees mf
      WHERE mf.fiscal_year=${year}
        AND mf.status<>'cancelled'
    `,
  ]) : [[{budget:0,income:0,expense:0}],[],[],[]];

  const s=summaryRows[0] ?? {};
  const income=Number(s.income ?? 0);
  const expense=Number(s.expense ?? 0);
  const balance=income-expense;
  const budget=Number(s.budget ?? 0);
  const budgetRemaining=budget-expense;

  const contributionExpected=feeRows
    .filter((fee)=>String(fee.status)!=="exempt")
    .reduce((sum,fee)=>sum+Number(fee.amount ?? 0),0);
  const contributionPaid=feeRows.reduce((sum,fee)=>sum+Number(fee.paid ?? 0),0);
  const contributionOpen=Math.max(0,contributionExpected-contributionPaid);
  const overdueCount=feeRows.filter((fee)=>{
    if (["paid","exempt","cancelled"].includes(String(fee.status))) return false;
    return Number(fee.due_total ?? 0)>Number(fee.paid ?? 0)+0.001;
  }).length;

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Finanzen</span>
          <h1>Finanzübersicht</h1>
          <p>Vereinsfinanzen, Budgets und Mitgliedsbeiträge auf einen Blick.</p>
        </div>
      </section>

      <FinanceNav active="overview" />

      {params.budget && <div className="form-success">Budget wurde gespeichert.</div>}
      {params.error && <div className="form-error">Die Eingaben konnten nicht verarbeitet werden.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Einnahmen</span><strong>{money(income)}</strong><small>{year}</small></article>
        <article className="stat-card"><span>Ausgaben</span><strong>{money(expense)}</strong><small>{year}</small></article>
        <article className="stat-card"><span>Saldo</span><strong className={balance<0 ? "negative" : ""}>{money(balance)}</strong><small>Einnahmen minus Ausgaben</small></article>
        <article className="stat-card"><span>Budgetrest</span><strong>{money(budgetRemaining)}</strong><small>Plan minus Ausgaben</small></article>
      </section>

      <section className="finance-overview-links">
        <Link href="/finanzen/beitraege">
          <span>Mitgliedsbeiträge</span>
          <strong>{money(contributionOpen)} offen</strong>
          <small>{money(contributionPaid)} von {money(contributionExpected)} eingegangen</small>
        </Link>
        <Link href="/finanzen/offene-beitraege">
          <span>Handlungsbedarf</span>
          <strong>{overdueCount} überfällig</strong>
          <small>Offene und fällige Beiträge prüfen</small>
        </Link>
        <Link href="/finanzen/beitragsarten">
          <span>Beitragsmodelle</span>
          <strong>Beitragsarten</strong>
          <small>Standard, Jugend, Ermäßigt und individuelle Modelle</small>
        </Link>
        <Link href="/finanzen/auswertung">
          <span>Jahresauswertung</span>
          <strong>{year}</strong>
          <small>Einzugsquote und Beitragsverteilung ansehen</small>
        </Link>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Buchungen</span><h2>Letzte Bewegungen</h2></div>
            <Link href="/finanzen/buchungen" className="ghost-button">Alle Buchungen</Link>
          </div>
          <div className="finance-list">
            {entries.length===0 ? (
              <div className="empty-state">Noch keine Buchungen vorhanden.</div>
            ) : entries.map((entry)=>(
              <div className="finance-row" key={String(entry.id)}>
                <div className={`finance-icon finance-${entry.entry_type}`}>
                  {entry.entry_type==="income" ? "+" : "−"}
                </div>
                <div className="finance-main">
                  <strong>{String(entry.description)}</strong>
                  <span>
                    {String(entry.category)} · {formatDate(entry.booked_on)}
                    {entry.first_name ? ` · ${entry.first_name} ${entry.last_name}` : ""}
                  </span>
                </div>
                <b className={entry.entry_type==="expense" ? "negative" : ""}>
                  {entry.entry_type==="expense" ? "−" : "+"}{money(entry.amount)}
                </b>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Budget</span><h2>Bereiche {year}</h2></div>
          </div>
          <div className="finance-list">
            {budgets.length===0 ? (
              <div className="empty-state">Noch keine Budgets hinterlegt.</div>
            ) : budgets.map((item)=>(
              <div className="budget-row" key={String(item.id)}>
                <div>
                  <strong>{String(item.category)}</strong>
                  <span>{String(item.notes || "Ohne Notiz")}</span>
                </div>
                <b>{money(item.amount)}</b>
              </div>
            ))}
          </div>

          {canWrite && (
            <form action={upsertBudgetAction} className="form-stack finance-budget-form">
              <input type="hidden" name="year" value={year} />
              <label>Bereich<input name="category" required placeholder="z. B. Turniere" /></label>
              <label>Betrag<input name="amount" inputMode="decimal" required /></label>
              <label>Notiz<input name="notes" /></label>
              <button className="primary-button">Budget speichern</button>
            </form>
          )}
        </article>
      </section>
    </div>
  );
}
