import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { FinanceNav } from "@/components/finance-nav";
import { updateMembershipFeeReminderAction } from "@/app/finanzen/actions";

export const dynamic="force-dynamic";

const euro=new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const money=(value:unknown)=>euro.format(Number(value ?? 0));
const formatDate=(value:unknown)=>{
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
};

export default async function OpenMembershipFeesPage({
  searchParams,
}:{
  searchParams:Promise<{year?:string;reminder?:string;error?:string}>;
}) {
  const user=await requirePermission("finance.read");
  const sql=getDb();
  const params=await searchParams;
  const canWrite=hasPermission(user.roles,"finance.write");
  const requestedYear=Number(params.year);
  const year=Number.isInteger(requestedYear) && requestedYear>=1900 && requestedYear<=2200
    ? requestedYear
    : new Date().getFullYear();

  const fees=sql ? await sql`
    SELECT
      mf.id::text,mf.amount,mf.status,mf.due_date,mf.fee_type_name,mf.payment_frequency,
      mf.reminder_level,mf.last_reminder_on,
      m.first_name,m.last_name,m.member_number,
      COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0) AS paid,
      CASE
          WHEN EXISTS (SELECT 1 FROM membership_fee_installments i WHERE i.fee_id=mf.id)
          THEN COALESCE((SELECT SUM(i.amount) FROM membership_fee_installments i WHERE i.fee_id=mf.id AND i.due_date<=CURRENT_DATE),0)
          WHEN mf.due_date IS NOT NULL AND mf.due_date<=CURRENT_DATE
          THEN mf.amount
          ELSE 0
        END AS due_total,
      (SELECT MIN(i.due_date) FROM membership_fee_installments i WHERE i.fee_id=mf.id AND i.due_date>CURRENT_DATE) AS next_due_date
    FROM membership_fees mf
    JOIN members m ON m.id=mf.member_id
    WHERE mf.fiscal_year=${year}
      AND mf.status NOT IN ('paid','exempt','cancelled')
    ORDER BY m.last_name,m.first_name
  ` : [];

  const rows=fees.map((fee)=>{
    const total=Number(fee.amount ?? 0);
    const paid=Number(fee.paid ?? 0);
    const due=Number(fee.due_total ?? 0);
    const remaining=Math.max(0,total-paid);
    const overdue=Math.max(0,due-paid);
    return {...fee,total,paid,remaining,overdue};
  }).filter((fee)=>fee.remaining>0.001);

  const overdueRows=rows.filter((fee)=>fee.overdue>0.001);
  const openTotal=rows.reduce((sum,fee)=>sum+fee.remaining,0);
  const overdueTotal=overdueRows.reduce((sum,fee)=>sum+fee.overdue,0);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Finanzen</span>
          <h1>Offene Beiträge</h1>
          <p>Offene und überfällige Mitgliedsbeiträge schnell erkennen.</p>
        </div>
        <form className="year-filter" method="get">
          <label>Beitragsjahr
            <select name="year" defaultValue={String(year)}>
              {[year-2,year-1,year,year+1].map((item)=>(
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <button className="ghost-button">Anzeigen</button>
        </form>
      </section>

      <FinanceNav active="open" />

      {params.reminder && <div className="form-success">Erinnerungsstatus wurde gespeichert.</div>}
      {params.error && <div className="form-error">Der Erinnerungsstatus konnte nicht gespeichert werden.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Offene Mitglieder</span><strong>{rows.length}</strong><small>{year}</small></article>
        <article className="stat-card"><span>Überfällig</span><strong>{overdueRows.length}</strong><small>bereits fällig</small></article>
        <article className="stat-card"><span>Offener Betrag</span><strong>{money(openTotal)}</strong><small>gesamt</small></article>
        <article className="stat-card"><span>Davon überfällig</span><strong>{money(overdueTotal)}</strong><small>sofort offen</small></article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Forderungen</span><h2>Offene Beiträge {year}</h2></div>
          <span className="count-chip">{rows.length}</span>
        </div>

        {rows.length===0 ? (
          <div className="empty-state">Keine offenen Mitgliedsbeiträge für {year}.</div>
        ) : (
          <div className="open-fee-list">
            {rows
              .sort((a,b)=>b.overdue-a.overdue || String(a.last_name).localeCompare(String(b.last_name),"de"))
              .map((fee)=>(
                <article className={fee.overdue>0 ? "open-fee-card overdue" : "open-fee-card"} key={String(fee.id)}>
                  <div>
                    <span>{fee.member_number ? `#${fee.member_number}` : "Mitglied"}</span>
                    <strong>{String(fee.first_name)} {String(fee.last_name)}</strong>
                    <small>{String(fee.fee_type_name || "Standard")}</small>
                  </div>
                  <div>
                    <span>Gesamt</span>
                    <strong>{money(fee.total)}</strong>
                    <small>{money(fee.paid)} bezahlt</small>
                  </div>
                  <div>
                    <span>Offen</span>
                    <strong>{money(fee.remaining)}</strong>
                    <small>{fee.overdue>0 ? `${money(fee.overdue)} überfällig` : "noch nicht fällig"}</small>
                  </div>
                  <div>
                    <span>Nächste Fälligkeit</span>
                    <strong>{formatDate(fee.next_due_date || fee.due_date)}</strong>
                    <small>{fee.overdue>0 ? "Handlungsbedarf" : "planmäßig"}</small>
                  </div>
                  <div className="open-fee-reminder">
                    <span>Erinnerungsstatus</span>
                    <strong>
                      {fee.reminder_level==="reminder1"
                        ? "1. Erinnerung"
                        : fee.reminder_level==="reminder2"
                          ? "2. Erinnerung"
                          : fee.reminder_level==="dunning"
                            ? "Mahnung"
                            : "Keine"}
                    </strong>
                    <small>{fee.last_reminder_on ? "zuletzt "+formatDate(fee.last_reminder_on) : "noch nicht erinnert"}</small>
                    {canWrite && (
                      <form action={updateMembershipFeeReminderAction}>
                        <input type="hidden" name="id" value={String(fee.id)} />
                        <select name="reminderLevel" defaultValue={String(fee.reminder_level || "none")}>
                          <option value="none">Keine</option>
                          <option value="reminder1">1. Erinnerung</option>
                          <option value="reminder2">2. Erinnerung</option>
                          <option value="dunning">Mahnung</option>
                        </select>
                        <button className="mini-button">Speichern</button>
                      </form>
                    )}
                  </div>
                </article>
              ))}
          </div>
        )}
      </article>
    </div>
  );
}
