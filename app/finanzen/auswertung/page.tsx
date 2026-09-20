import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { FinanceNav } from "@/components/finance-nav";

export const dynamic="force-dynamic";

const euro=new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const money=(value:unknown)=>euro.format(Number(value ?? 0));

const monthNames=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

export default async function FinanceAnalysisPage({
  searchParams,
}:{
  searchParams:Promise<{year?:string}>;
}) {
  await requirePermission("finance.read");
  const sql=getDb();
  const params=await searchParams;
  const requestedYear=Number(params.year);
  const year=Number.isInteger(requestedYear) && requestedYear>=1900 && requestedYear<=2200
    ? requestedYear
    : new Date().getFullYear();

  const [feeSummary,monthlyPayments,typeSummary,financeSummary]=sql ? await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(mf.amount),0) AS expected,
        COALESCE(SUM((SELECT COALESCE(SUM(p.amount),0) FROM membership_fee_payments p WHERE p.fee_id=mf.id)),0) AS paid,
        COUNT(*)::int AS fees,
        COUNT(*) FILTER (WHERE mf.status='exempt')::int AS exempt,
        COUNT(*) FILTER (WHERE mf.status='cancelled')::int AS cancelled
      FROM membership_fees mf
      WHERE mf.fiscal_year=${year}
    `,
    sql`
      SELECT
        EXTRACT(MONTH FROM p.paid_on)::int AS month,
        COALESCE(SUM(p.amount),0) AS amount
      FROM membership_fee_payments p
      JOIN membership_fees mf ON mf.id=p.fee_id
      WHERE mf.fiscal_year=${year}
      GROUP BY EXTRACT(MONTH FROM p.paid_on)
      ORDER BY month
    `,
    sql`
      SELECT
        COALESCE(mf.fee_type_name,'Standard') AS fee_type_name,
        COUNT(*)::int AS members,
        COALESCE(SUM(mf.amount),0) AS expected,
        COALESCE(SUM((SELECT COALESCE(SUM(p.amount),0) FROM membership_fee_payments p WHERE p.fee_id=mf.id)),0) AS paid
      FROM membership_fees mf
      WHERE mf.fiscal_year=${year}
      GROUP BY COALESCE(mf.fee_type_name,'Standard')
      ORDER BY fee_type_name
    `,
    sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE entry_type='income'),0) AS income,
        COALESCE(SUM(amount) FILTER (WHERE entry_type='expense'),0) AS expense
      FROM finance_entries
      WHERE status='booked'
        AND EXTRACT(YEAR FROM booked_on)=${year}
    `,
  ]) : [[{expected:0,paid:0,fees:0,exempt:0,cancelled:0}],[],[],[{income:0,expense:0}]];

  const fees=feeSummary[0] ?? {};
  const finance=financeSummary[0] ?? {};
  const expected=Number(fees.expected ?? 0);
  const paid=Number(fees.paid ?? 0);
  const open=Math.max(0,expected-paid);
  const collectionRate=expected>0 ? Math.round((paid/expected)*100) : 0;
  const balance=Number(finance.income ?? 0)-Number(finance.expense ?? 0);
  const monthly=new Map(monthlyPayments.map((row)=>[Number(row.month),Number(row.amount)]));

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Finanzen</span>
          <h1>Auswertung</h1>
          <p>Jahresauswertung für Mitgliedsbeiträge und Vereinsfinanzen.</p>
        </div>
        <form className="year-filter" method="get">
          <label>Jahr
            <select name="year" defaultValue={String(year)}>
              {[year-2,year-1,year,year+1].map((item)=>(
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <button className="ghost-button">Anzeigen</button>
        </form>
      </section>

      <FinanceNav active="analysis" />

      <section className="stat-grid">
        <article className="stat-card"><span>Beitragssoll</span><strong>{money(expected)}</strong><small>{year}</small></article>
        <article className="stat-card"><span>Eingegangen</span><strong>{money(paid)}</strong><small>{collectionRate}% Quote</small></article>
        <article className="stat-card"><span>Offen</span><strong>{money(open)}</strong><small>noch ausstehend</small></article>
        <article className="stat-card"><span>Finanzsaldo</span><strong>{money(balance)}</strong><small>Einnahmen minus Ausgaben</small></article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Beiträge</span><h2>Zahlungseingänge nach Monat</h2></div>
          </div>
          <div className="finance-month-grid">
            {monthNames.map((month,index)=>{
              const amount=monthly.get(index+1) ?? 0;
              return (
                <div key={month}>
                  <span>{month}</span>
                  <strong>{money(amount)}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Status</span><h2>Beitragsjahr {year}</h2></div>
          </div>
          <div className="finance-analysis-list">
            <div><span>Beitragsforderungen</span><strong>{Number(fees.fees ?? 0)}</strong></div>
            <div><span>Befreit</span><strong>{Number(fees.exempt ?? 0)}</strong></div>
            <div><span>Storniert</span><strong>{Number(fees.cancelled ?? 0)}</strong></div>
            <div><span>Einzugsquote</span><strong>{collectionRate}%</strong></div>
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Beitragsarten</span><h2>Verteilung & Einnahmen</h2></div>
        </div>

        {typeSummary.length===0 ? (
          <div className="empty-state">Für {year} liegen noch keine Beitragsdaten vor.</div>
        ) : (
          <div className="fee-analysis-table">
            <div className="fee-analysis-head">
              <span>Beitragsart</span><span>Mitglieder</span><span>Soll</span><span>Ist</span><span>Offen</span>
            </div>
            {typeSummary.map((row)=>(
              <div className="fee-analysis-row" key={String(row.fee_type_name)}>
                <strong>{String(row.fee_type_name)}</strong>
                <span>{Number(row.members)}</span>
                <span>{money(row.expected)}</span>
                <span>{money(row.paid)}</span>
                <span>{money(Math.max(0,Number(row.expected)-Number(row.paid)))}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
