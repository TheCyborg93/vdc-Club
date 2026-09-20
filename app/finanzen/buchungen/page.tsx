import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { FinanceNav } from "@/components/finance-nav";
import { createFinanceEntryAction } from "@/app/finanzen/actions";

export const dynamic="force-dynamic";

const euro=new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const money=(value:unknown)=>euro.format(Number(value ?? 0));
const formatDate=(value:unknown)=>{
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
};

export default async function FinanceEntriesPage({
  searchParams,
}:{
  searchParams:Promise<{created?:string;error?:string}>;
}) {
  const user=await requirePermission("finance.read");
  const sql=getDb();
  const params=await searchParams;
  const canWrite=hasPermission(user.roles,"finance.write");

  const [entries,members,summary]=sql ? await Promise.all([
    sql`
      SELECT
        f.id::text,f.entry_type,f.amount,f.category,f.description,f.booked_on,
        m.first_name,m.last_name
      FROM finance_entries f
      LEFT JOIN members m ON m.id=f.member_id
      WHERE f.status='booked'
      ORDER BY f.booked_on DESC,f.created_at DESC
      LIMIT 250
    `,
    sql`
      SELECT id::text,first_name,last_name
      FROM members
      WHERE status='active'
      ORDER BY last_name,first_name
    `,
    sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE entry_type='income'),0) AS income,
        COALESCE(SUM(amount) FILTER (WHERE entry_type='expense'),0) AS expense
      FROM finance_entries
      WHERE status='booked'
        AND EXTRACT(YEAR FROM booked_on)=EXTRACT(YEAR FROM CURRENT_DATE)
    `,
  ]) : [[],[],[{income:0,expense:0}]];

  const s=summary[0] ?? {};
  const balance=Number(s.income ?? 0)-Number(s.expense ?? 0);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Finanzen</span>
          <h1>Buchungen</h1>
          <p>Einnahmen und Ausgaben des Vereins zentral erfassen und nachvollziehen.</p>
        </div>
      </section>

      <FinanceNav active="entries" />

      {params.created && <div className="form-success">Buchung wurde gespeichert.</div>}
      {params.error && <div className="form-error">Die Buchung konnte nicht gespeichert werden.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Einnahmen</span><strong>{money(s.income)}</strong><small>aktuelles Jahr</small></article>
        <article className="stat-card"><span>Ausgaben</span><strong>{money(s.expense)}</strong><small>aktuelles Jahr</small></article>
        <article className="stat-card"><span>Saldo</span><strong>{money(balance)}</strong><small>aktuelles Jahr</small></article>
        <article className="stat-card"><span>Buchungen</span><strong>{entries.length}</strong><small>angezeigt</small></article>
      </section>

      <section className={canWrite ? "finance-manage-grid" : ""}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Journal</span><h2>Alle Buchungen</h2></div>
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

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head">
              <div><span className="eyebrow">Neu</span><h2>Buchung erfassen</h2></div>
            </div>
            <form action={createFinanceEntryAction} className="form-stack">
              <div className="form-grid">
                <label>Art
                  <select name="entryType" defaultValue="expense">
                    <option value="income">Einnahme</option>
                    <option value="expense">Ausgabe</option>
                  </select>
                </label>
                <label>Betrag<input name="amount" inputMode="decimal" placeholder="0,00" required /></label>
              </div>
              <label>Kategorie<input name="category" required placeholder="z. B. Mitgliedsbeitrag, Material, Sponsor" /></label>
              <label>Beschreibung<input name="description" required /></label>
              <div className="form-grid">
                <label>Datum<input name="bookedOn" type="date" required /></label>
                <label>Mitglied
                  <select name="memberId" defaultValue="">
                    <option value="">Keine Zuordnung</option>
                    {members.map((member)=>(
                      <option key={String(member.id)} value={String(member.id)}>
                        {String(member.first_name)} {String(member.last_name)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="primary-button">Buchung speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
