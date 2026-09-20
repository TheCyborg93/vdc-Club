import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { FinanceNav } from "@/components/finance-nav";
import {
  generateMembershipFeesAction,
  recordMembershipFeePaymentAction,
  saveMemberFeeProfileAction,
  updateMembershipFeeStatusAction,
} from "@/app/finanzen/actions";

export const dynamic="force-dynamic";

const euro=new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const money=(value:unknown)=>euro.format(Number(value ?? 0));
const formatDate=(value:unknown)=>{
  if (!value) return "–";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(d);
};
const dateValue=(value:unknown)=>{
  if (!value) return "";
  const d=new Date(String(value));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10);
};

const frequencyLabels:Record<string,string>={
  annual:"Jährlich",
  semiannual:"Halbjährlich",
  quarterly:"Quartalsweise",
  monthly:"Monatlich",
};

function derivedStatus(fee:{
  status:unknown;
  amount:unknown;
  paid:unknown;
  due_total:unknown;
}) {
  const status=String(fee.status);
  if (status==="exempt") return {key:"exempt",label:"Befreit"};
  if (status==="cancelled") return {key:"cancelled",label:"Storniert"};
  const amount=Number(fee.amount ?? 0);
  const paid=Number(fee.paid ?? 0);
  const dueTotal=Number(fee.due_total ?? 0);
  if (paid+0.001>=amount || status==="paid") return {key:"paid",label:"Bezahlt"};
  if (dueTotal>paid+0.001) return {key:"overdue",label:paid>0 ? "Teilweise / überfällig" : "Überfällig"};
  if (paid>0) return {key:"partial",label:"Teilweise bezahlt"};
  return {key:"open",label:"Offen"};
}

export default async function MembershipFeesPage({
  searchParams,
}:{
  searchParams:Promise<{
    year?:string;
    fees?:string;
    payment?:string;
    profile?:string;
    status?:string;
    error?:string;
  }>;
}) {
  const user=await requirePermission("finance.read");
  const sql=getDb();
  const params=await searchParams;
  const canWrite=hasPermission(user.roles,"finance.write");

  const requestedYear=Number(params.year);
  const year=Number.isInteger(requestedYear) && requestedYear>=1900 && requestedYear<=2200
    ? requestedYear
    : new Date().getFullYear();

  const [fees,members,types,profileRows,clubRows]=sql ? await Promise.all([
    sql`
      SELECT
        mf.id::text,mf.member_id::text,mf.fiscal_year,mf.amount,mf.due_date,mf.status,mf.paid_on,
        mf.notes,mf.fee_type_name,mf.payment_frequency,mf.reference_text,
        m.first_name,m.last_name,m.member_number,
        COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0) AS paid,
        COALESCE((SELECT SUM(i.amount) FROM membership_fee_installments i WHERE i.fee_id=mf.id AND i.due_date<=CURRENT_DATE),0) AS due_total,
        (SELECT MIN(i.due_date) FROM membership_fee_installments i WHERE i.fee_id=mf.id AND i.due_date>CURRENT_DATE) AS next_due_date,
        (SELECT COUNT(*) FROM membership_fee_installments i WHERE i.fee_id=mf.id)::int AS installments
      FROM membership_fees mf
      JOIN members m ON m.id=mf.member_id
      WHERE mf.fiscal_year=${year}
      ORDER BY m.last_name,m.first_name
    `,
    sql`
      SELECT
        m.id::text,m.first_name,m.last_name,m.member_number,m.membership_type,
        p.fee_type_id::text,p.custom_annual_amount,p.custom_payment_frequency,
        p.reference_text,p.valid_from,p.valid_until,p.exempt_from,p.exempt_until,
        p.exemption_reason,p.notes,
        t.name AS fee_type_name,t.annual_amount AS type_amount,t.payment_frequency AS type_frequency
      FROM members m
      LEFT JOIN member_fee_profiles p ON p.member_id=m.id
      LEFT JOIN membership_fee_types t ON t.id=p.fee_type_id
      WHERE m.status='active'
      ORDER BY m.last_name,m.first_name
    `,
    sql`
      SELECT id::text,name,annual_amount,payment_frequency
      FROM membership_fee_types
      WHERE is_active=true
      ORDER BY name
    `,
    sql`
      SELECT count(*)::int AS configured
      FROM member_fee_profiles
    `,
    sql`
      SELECT default_annual_fee,fee_due_month,fee_due_day
      FROM club_profile
      WHERE id=1
      LIMIT 1
    `,
  ]) : [[],[],[],[{configured:0}],[]];

  const club=clubRows[0] ?? {};
  const configured=Number(profileRows[0]?.configured ?? 0);
  const expected=fees.reduce((sum,fee)=>sum+Number(fee.amount ?? 0),0);
  const received=fees.reduce((sum,fee)=>sum+Number(fee.paid ?? 0),0);
  const open=Math.max(0,expected-received);
  const overdue=fees.filter((fee)=>derivedStatus(fee).key==="overdue").length;

  const success=params.fees!==undefined || params.payment || params.profile || params.status;
  const errorLabels:Record<string,string>={
    invalid:"Die Eingaben sind ungültig.",
    not_found:"Der Beitrag wurde nicht gefunden.",
    overpayment:"Die Zahlung ist höher als der noch offene Beitrag.",
    database:"Die Datenbank ist nicht verfügbar.",
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Finanzen</span>
          <h1>Mitgliedsbeiträge</h1>
          <p>Beitragsmodelle zuordnen, Jahresforderungen erzeugen und Zahlungen verfolgen.</p>
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

      <FinanceNav active="fees" />

      {success && <div className="form-success">Beitragsdaten wurden aktualisiert.</div>}
      {params.error && <div className="form-error">{errorLabels[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Soll</span><strong>{money(expected)}</strong><small>{year}</small></article>
        <article className="stat-card"><span>Eingegangen</span><strong>{money(received)}</strong><small>zugeordnet</small></article>
        <article className="stat-card"><span>Offen</span><strong>{money(open)}</strong><small>Restbetrag</small></article>
        <article className="stat-card"><span>Überfällig</span><strong>{overdue}</strong><small>Mitglieder</small></article>
      </section>

      {canWrite && (
        <article className="panel contribution-run-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Beitragslauf</span>
              <h2>Beiträge für {year} erzeugen</h2>
            </div>
          </div>
          <form action={generateMembershipFeesAction} className="contribution-run-form">
            <input type="hidden" name="year" value={year} />
            <label>Fallback-Jahresbeitrag
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={club.default_annual_fee!=null ? String(club.default_annual_fee) : ""}
                placeholder="nur wenn keine Beitragsart zugeordnet"
              />
            </label>
            <label>Fallback-Fälligkeit
              <input
                name="dueDate"
                type="date"
                defaultValue={
                  club.fee_due_month && club.fee_due_day
                    ? `${year}-${String(club.fee_due_month).padStart(2,"0")}-${String(club.fee_due_day).padStart(2,"0")}`
                    : ""
                }
              />
            </label>
            <div className="contribution-run-copy">
              <strong>{members.length} aktive Mitglieder</strong>
              <span>{configured} mit individuellem Beitragsprofil. Bereits vorhandene Beiträge für {year} werden nicht überschrieben.</span>
            </div>
            <button className="primary-button">Beitragslauf starten</button>
          </form>
        </article>
      )}

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Beitragsstatus</span><h2>Forderungen {year}</h2></div>
          <span className="count-chip">{fees.length}</span>
        </div>

        {fees.length===0 ? (
          <div className="empty-state">Für {year} wurden noch keine Beiträge erzeugt.</div>
        ) : (
          <div className="contribution-list">
            {fees.map((fee)=>{
              const status=derivedStatus(fee);
              const paid=Number(fee.paid ?? 0);
              const amount=Number(fee.amount ?? 0);
              const remaining=Math.max(0,amount-paid);

              return (
                <details className="contribution-card" key={String(fee.id)}>
                  <summary>
                    <div className="contribution-person">
                      <strong>{String(fee.first_name)} {String(fee.last_name)}</strong>
                      <span>
                        {fee.member_number ? `#${fee.member_number} · ` : ""}
                        {String(fee.fee_type_name || "Standard")} · {frequencyLabels[String(fee.payment_frequency || "annual")]}
                      </span>
                    </div>
                    <div className="contribution-money">
                      <strong>{money(remaining)}</strong>
                      <span>offen von {money(amount)}</span>
                    </div>
                    <span className={`fee-status fee-${status.key}`}>{status.label}</span>
                  </summary>

                  <div className="contribution-body">
                    <div className="contribution-detail-grid">
                      <div><span>Bezahlt</span><strong>{money(paid)}</strong></div>
                      <div><span>Fällig bis heute</span><strong>{money(fee.due_total)}</strong></div>
                      <div><span>Nächste Fälligkeit</span><strong>{formatDate(fee.next_due_date)}</strong></div>
                      <div><span>Raten</span><strong>{Number(fee.installments || 1)}</strong></div>
                      {fee.reference_text && <div><span>Referenz</span><strong>{String(fee.reference_text)}</strong></div>}
                    </div>

                    {canWrite && (
                      <div className="contribution-actions-grid">
                        {remaining>0 && !["exempt","cancelled"].includes(String(fee.status)) && (
                          <form action={recordMembershipFeePaymentAction} className="form-stack contribution-payment-form">
                            <input type="hidden" name="feeId" value={String(fee.id)} />
                            <strong>Zahlung erfassen</strong>
                            <div className="form-grid">
                              <label>Betrag
                                <input name="amount" inputMode="decimal" defaultValue={remaining.toFixed(2).replace(".",",")} required />
                              </label>
                              <label>Zahlungsdatum<input name="paidOn" type="date" required /></label>
                            </div>
                            <label>Notiz<input name="note" placeholder="optional" /></label>
                            <button className="primary-button">Zahlung buchen</button>
                          </form>
                        )}

                        <form action={updateMembershipFeeStatusAction} className="form-stack contribution-status-form">
                          <input type="hidden" name="id" value={String(fee.id)} />
                          <strong>Sonderstatus</strong>
                          <label>Status
                            <select name="status" defaultValue={String(fee.status)}>
                              <option value="open">Offen</option>
                              <option value="paid">Bezahlt</option>
                              <option value="exempt">Befreit</option>
                              <option value="cancelled">Storniert</option>
                            </select>
                          </label>
                          <label>Begründung / Notiz<input name="notes" defaultValue={String(fee.notes ?? "")} /></label>
                          <button className="ghost-button">Status speichern</button>
                        </form>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </article>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Mitglieder</span><h2>Beitragsprofile</h2></div>
          <span className="count-chip">{members.length}</span>
        </div>

        <div className="member-fee-profile-list">
          {members.map((member)=>(
            <details className="member-fee-profile-card" key={String(member.id)}>
              <summary>
                <div>
                  <strong>{String(member.first_name)} {String(member.last_name)}</strong>
                  <span>
                    {String(member.fee_type_name || "Keine Beitragsart")}
                    {member.custom_annual_amount!=null ? ` · individuell ${money(member.custom_annual_amount)}` : ""}
                  </span>
                </div>
                <div>
                  <strong>
                    {member.custom_annual_amount!=null
                      ? money(member.custom_annual_amount)
                      : member.type_amount!=null
                        ? money(member.type_amount)
                        : "Standard"}
                  </strong>
                  <span>
                    {frequencyLabels[String(member.custom_payment_frequency || member.type_frequency || "annual")]}
                  </span>
                </div>
              </summary>

              <div className="member-fee-profile-body">
                {canWrite ? (
                  <form action={saveMemberFeeProfileAction} className="form-stack">
                    <input type="hidden" name="memberId" value={String(member.id)} />
                    <div className="form-grid">
                      <label>Beitragsart
                        <select name="feeTypeId" defaultValue={String(member.fee_type_id ?? "")}>
                          <option value="">Standard / Vereinsprofil</option>
                          {types.map((type)=>(
                            <option key={String(type.id)} value={String(type.id)}>
                              {String(type.name)} · {money(type.annual_amount)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Individueller Jahresbetrag
                        <input
                          name="customAnnualAmount"
                          inputMode="decimal"
                          defaultValue={member.custom_annual_amount!=null ? String(member.custom_annual_amount) : ""}
                          placeholder="leer = Beitragsart"
                        />
                      </label>
                    </div>
                    <div className="form-grid">
                      <label>Individueller Zahlungsrhythmus
                        <select name="customPaymentFrequency" defaultValue={String(member.custom_payment_frequency ?? "")}>
                          <option value="">Aus Beitragsart übernehmen</option>
                          <option value="annual">Jährlich</option>
                          <option value="semiannual">Halbjährlich</option>
                          <option value="quarterly">Quartalsweise</option>
                          <option value="monthly">Monatlich</option>
                        </select>
                      </label>
                      <label>Zahlungsreferenz / Verwendungszweck
                        <input name="referenceText" defaultValue={String(member.reference_text ?? "")} placeholder="z. B. VDC-001" />
                      </label>
                    </div>
                    <div className="form-grid">
                      <label>Beitragsprofil gültig ab<input name="validFrom" type="date" defaultValue={dateValue(member.valid_from)} /></label>
                      <label>Gültig bis<input name="validUntil" type="date" defaultValue={dateValue(member.valid_until)} /></label>
                    </div>
                    <div className="form-grid">
                      <label>Befreit ab<input name="exemptFrom" type="date" defaultValue={dateValue(member.exempt_from)} /></label>
                      <label>Befreit bis<input name="exemptUntil" type="date" defaultValue={dateValue(member.exempt_until)} /></label>
                    </div>
                    <label>Grund der Befreiung<input name="exemptionReason" defaultValue={String(member.exemption_reason ?? "")} /></label>
                    <label>Interne Notiz<textarea name="notes" rows={2} defaultValue={String(member.notes ?? "")} /></label>
                    <button className="primary-button">Beitragsprofil speichern</button>
                  </form>
                ) : (
                  <div className="fee-type-readonly">
                    <span>Beitragsart: {String(member.fee_type_name || "Standard")}</span>
                    <span>Referenz: {String(member.reference_text || "–")}</span>
                    {member.exemption_reason && <span>Befreiung: {String(member.exemption_reason)}</span>}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </article>
    </div>
  );
}
