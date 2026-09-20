import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { FinanceNav } from "@/components/finance-nav";
import {
  createMembershipFeeTypeAction,
  updateMembershipFeeTypeAction,
} from "@/app/finanzen/actions";

export const dynamic="force-dynamic";

const euro=new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const money=(value:unknown)=>euro.format(Number(value ?? 0));

const frequencyLabels:Record<string,string>={
  annual:"Jährlich",
  semiannual:"Halbjährlich",
  quarterly:"Quartalsweise",
  monthly:"Monatlich",
};

export default async function MembershipFeeTypesPage({
  searchParams,
}:{
  searchParams:Promise<{created?:string;updated?:string;error?:string}>;
}) {
  const user=await requirePermission("finance.read");
  const sql=getDb();
  const params=await searchParams;
  const canWrite=hasPermission(user.roles,"finance.write");

  const types=sql ? await sql`
    SELECT
      t.id::text,t.name,t.annual_amount,t.payment_frequency,
      t.first_due_month,t.due_day,t.is_active,t.notes,
      count(p.member_id)::int AS assigned_members
    FROM membership_fee_types t
    LEFT JOIN member_fee_profiles p ON p.fee_type_id=t.id
    GROUP BY t.id
    ORDER BY t.is_active DESC,t.name
  ` : [];

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Finanzen</span>
          <h1>Beitragsarten</h1>
          <p>Standardbeiträge, Ermäßigungen, Jugendbeiträge und weitere Beitragsmodelle verwalten.</p>
        </div>
      </section>

      <FinanceNav active="types" />

      {(params.created || params.updated) && <div className="form-success">Beitragsart wurde gespeichert.</div>}
      {params.error && <div className="form-error">Die Beitragsart konnte nicht gespeichert werden.</div>}

      <section className={canWrite ? "finance-manage-grid" : ""}>
        <article className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Modelle</span><h2>Beitragsarten</h2></div>
            <span className="count-chip">{types.length}</span>
          </div>

          {types.length===0 ? (
            <div className="empty-state">Noch keine Beitragsarten angelegt.</div>
          ) : (
            <div className="fee-type-list">
              {types.map((type)=>(
                <details className="fee-type-card" key={String(type.id)}>
                  <summary>
                    <div>
                      <span>{type.is_active ? "Aktiv" : "Inaktiv"}</span>
                      <strong>{String(type.name)}</strong>
                      <small>{Number(type.assigned_members)} Mitglieder zugeordnet</small>
                    </div>
                    <div>
                      <strong>{money(type.annual_amount)}</strong>
                      <span>{frequencyLabels[String(type.payment_frequency)] ?? String(type.payment_frequency)}</span>
                    </div>
                  </summary>

                  <div className="fee-type-body">
                    {canWrite ? (
                      <form action={updateMembershipFeeTypeAction} className="form-stack">
                        <input type="hidden" name="id" value={String(type.id)} />
                        <label>Name<input name="name" defaultValue={String(type.name)} required /></label>
                        <div className="form-grid">
                          <label>Jahresbeitrag
                            <input name="annualAmount" inputMode="decimal" defaultValue={String(type.annual_amount)} required />
                          </label>
                          <label>Zahlungsrhythmus
                            <select name="paymentFrequency" defaultValue={String(type.payment_frequency)}>
                              <option value="annual">Jährlich</option>
                              <option value="semiannual">Halbjährlich</option>
                              <option value="quarterly">Quartalsweise</option>
                              <option value="monthly">Monatlich</option>
                            </select>
                          </label>
                        </div>
                        <div className="form-grid">
                          <label>Erster Fälligkeitsmonat
                            <input name="firstDueMonth" type="number" min="1" max="12" defaultValue={Number(type.first_due_month)} required />
                          </label>
                          <label>Fälligkeitstag
                            <input name="dueDay" type="number" min="1" max="31" defaultValue={Number(type.due_day)} required />
                          </label>
                        </div>
                        <label>Notiz<textarea name="notes" rows={3} defaultValue={String(type.notes ?? "")} /></label>
                        <label className="checkbox-row">
                          <input type="checkbox" name="isActive" value="1" defaultChecked={Boolean(type.is_active)} />
                          <span>Beitragsart aktiv</span>
                        </label>
                        <button className="primary-button">Änderungen speichern</button>
                      </form>
                    ) : (
                      <div className="fee-type-readonly">
                        <span>Rhythmus: {frequencyLabels[String(type.payment_frequency)]}</span>
                        <span>Fälligkeit: ab Monat {Number(type.first_due_month)}, Tag {Number(type.due_day)}</span>
                        {type.notes && <p>{String(type.notes)}</p>}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </article>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head">
              <div><span className="eyebrow">Neu</span><h2>Beitragsart anlegen</h2></div>
            </div>
            <form action={createMembershipFeeTypeAction} className="form-stack">
              <label>Name<input name="name" required placeholder="z. B. Standard, Jugend, Ermäßigt" /></label>
              <div className="form-grid">
                <label>Jahresbeitrag<input name="annualAmount" inputMode="decimal" required placeholder="120,00" /></label>
                <label>Zahlungsrhythmus
                  <select name="paymentFrequency" defaultValue="annual">
                    <option value="annual">Jährlich</option>
                    <option value="semiannual">Halbjährlich</option>
                    <option value="quarterly">Quartalsweise</option>
                    <option value="monthly">Monatlich</option>
                  </select>
                </label>
              </div>
              <div className="form-grid">
                <label>Erster Fälligkeitsmonat<input name="firstDueMonth" type="number" min="1" max="12" defaultValue="1" required /></label>
                <label>Fälligkeitstag<input name="dueDay" type="number" min="1" max="31" defaultValue="1" required /></label>
              </div>
              <label>Notiz<textarea name="notes" rows={3} placeholder="Optional" /></label>
              <button className="primary-button">Beitragsart speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
