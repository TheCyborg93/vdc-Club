import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  createFinanceEntryAction,
  generateMembershipFeesAction,
  updateMembershipFeeStatusAction,
  upsertBudgetAction,
} from "@/app/finanzen/actions";

export const dynamic = "force-dynamic";

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

function money(value: unknown) {
  return euro.format(Number(value ?? 0));
}

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(date);
}

const feeLabels: Record<string,string> = {
  open: "Offen",
  paid: "Bezahlt",
  exempt: "Befreit",
  cancelled: "Storniert",
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; budget?: string; fees?: string }>;
}) {
  const actor = await requirePermission("finance.read");
  const sql = getDb();
  const params = await searchParams;
  const canWrite = hasPermission(actor.roles, "finance.write");

  const [summaryRows, entries, budgets, fees, members, profileRows] = sql
    ? await Promise.all([
        sql`
          SELECT
            COALESCE((SELECT SUM(amount) FROM finance_budgets WHERE fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)::int),0) AS budget,
            COALESCE((SELECT SUM(amount) FROM finance_entries WHERE entry_type = 'income' AND status = 'booked' AND EXTRACT(YEAR FROM booked_on) = EXTRACT(YEAR FROM CURRENT_DATE)),0) AS income,
            COALESCE((SELECT SUM(amount) FROM finance_entries WHERE entry_type = 'expense' AND status = 'booked' AND EXTRACT(YEAR FROM booked_on) = EXTRACT(YEAR FROM CURRENT_DATE)),0) AS expense,
            COALESCE((SELECT COUNT(*) FROM membership_fees WHERE fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND status = 'open'),0)::int AS open_fees
        `,
        sql`
          SELECT
            f.id::text,
            f.entry_type,
            f.amount,
            f.category,
            f.description,
            f.booked_on,
            m.first_name,
            m.last_name
          FROM finance_entries f
          LEFT JOIN members m ON m.id = f.member_id
          WHERE f.status = 'booked'
          ORDER BY f.booked_on DESC, f.created_at DESC
          LIMIT 30
        `,
        sql`
          SELECT id::text, fiscal_year, category, amount, notes
          FROM finance_budgets
          WHERE fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
          ORDER BY category
        `,
        sql`
          SELECT
            mf.id::text,
            mf.amount,
            mf.due_date,
            mf.status,
            mf.paid_on,
            m.first_name,
            m.last_name,
            m.member_number
          FROM membership_fees mf
          JOIN members m ON m.id = mf.member_id
          WHERE mf.fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
          ORDER BY
            CASE mf.status WHEN 'open' THEN 0 WHEN 'paid' THEN 1 ELSE 2 END,
            m.last_name, m.first_name
        `,
        sql`
          SELECT id::text, first_name, last_name
          FROM members
          WHERE status = 'active'
          ORDER BY last_name, first_name
        `,
        sql`
          SELECT default_annual_fee,fee_due_month,fee_due_day
          FROM club_profile
          WHERE id=1
          LIMIT 1
        `,
      ])
    : [[{ budget: 0, income: 0, expense: 0, open_fees: 0 }], [], [], [], [], []];

  const s = summaryRows[0] ?? {};
  const profile = profileRows[0] ?? {};
  const balance = Number(s.income ?? 0) - Number(s.expense ?? 0);
  const budgetRemaining = Number(s.budget ?? 0) - Number(s.expense ?? 0);
  const currentYear = new Date().getFullYear();
  const defaultDueDate = profile.fee_due_month && profile.fee_due_day
    ? `${currentYear}-${String(profile.fee_due_month).padStart(2,"0")}-${String(profile.fee_due_day).padStart(2,"0")}`
    : "";

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Finanzen</span>
          <h1>Finanzübersicht</h1>
          <p>Budgets, Einnahmen, Ausgaben und Mitgliedsbeiträge als schlanke Vorstandsübersicht.</p>
        </div>
      </section>

      {params.error && <div className="form-error">Die Eingaben konnten nicht verarbeitet werden.</div>}
      {(params.created || params.budget || params.fees) && <div className="form-success">Finanzdaten wurden aktualisiert.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Budget</span><strong>{money(s.budget)}</strong><small>aktuelles Jahr</small></article>
        <article className="stat-card"><span>Ausgaben</span><strong>{money(s.expense)}</strong><small>gebucht</small></article>
        <article className="stat-card"><span>Budgetrest</span><strong>{money(budgetRemaining)}</strong><small>Plan minus Ausgaben</small></article>
        <article className="stat-card"><span>Offene Beiträge</span><strong>{Number(s.open_fees ?? 0)}</strong><small>Mitglieder</small></article>
      </section>

      <section className="finance-summary-strip">
        <div><span>Einnahmen</span><strong>{money(s.income)}</strong></div>
        <div><span>Ausgaben</span><strong>{money(s.expense)}</strong></div>
        <div><span>Saldo</span><strong className={balance < 0 ? "negative" : ""}>{money(balance)}</strong></div>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Buchungen</span><h2>Letzte Bewegungen</h2></div></div>
          <div className="finance-list">
            {entries.length === 0 ? <div className="empty-state">Noch keine Buchungen vorhanden.</div> : entries.map((entry) => (
              <div className="finance-row" key={String(entry.id)}>
                <div className={`finance-icon finance-${entry.entry_type}`}>{entry.entry_type === "income" ? "+" : "−"}</div>
                <div className="finance-main">
                  <strong>{String(entry.description)}</strong>
                  <span>{String(entry.category)} · {formatDate(entry.booked_on)}
                    {entry.first_name ? ` · ${entry.first_name} ${entry.last_name}` : ""}
                  </span>
                </div>
                <b className={entry.entry_type === "expense" ? "negative" : ""}>
                  {entry.entry_type === "expense" ? "−" : "+"}{money(entry.amount)}
                </b>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Budget</span><h2>Bereiche</h2></div></div>
          <div className="finance-list">
            {budgets.length === 0 ? <div className="empty-state">Noch keine Budgets hinterlegt.</div> : budgets.map((budget) => (
              <div className="budget-row" key={String(budget.id)}>
                <div><strong>{String(budget.category)}</strong><span>{budget.notes ? String(budget.notes) : "Ohne Notiz"}</span></div>
                <b>{money(budget.amount)}</b>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Mitgliedsbeiträge</span><h2>Beitragsstatus {new Date().getFullYear()}</h2></div>
          <span className="count-chip">{fees.length}</span>
        </div>
        <div className="fee-table">
          {fees.length === 0 ? <div className="empty-state">Noch keine Beiträge für dieses Jahr erzeugt.</div> : fees.map((fee) => (
            <div className="fee-row" key={String(fee.id)}>
              <div>
                <strong>{String(fee.first_name)} {String(fee.last_name)}</strong>
                <span>{fee.member_number ? `#${fee.member_number} · ` : ""}Fällig {formatDate(fee.due_date)}</span>
              </div>
              <b>{money(fee.amount)}</b>
              <span className={`fee-status fee-${fee.status}`}>{feeLabels[String(fee.status)] ?? String(fee.status)}</span>
              {canWrite && (
                <form action={updateMembershipFeeStatusAction}>
                  <input type="hidden" name="id" value={String(fee.id)} />
                  <select name="status" defaultValue={String(fee.status)}>
                    <option value="open">Offen</option>
                    <option value="paid">Bezahlt</option>
                    <option value="exempt">Befreit</option>
                    <option value="cancelled">Storniert</option>
                  </select>
                  <button className="mini-button">Speichern</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </article>

      {canWrite && (
        <section className="finance-admin-grid">
          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Neu</span><h2>Buchung erfassen</h2></div></div>
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
              <label>Kategorie<input name="category" placeholder="z. B. Material, Beitrag, Sponsor" required /></label>
              <label>Beschreibung<input name="description" required /></label>
              <div className="form-grid">
                <label>Datum<input name="bookedOn" type="date" required /></label>
                <label>Mitglied
                  <select name="memberId" defaultValue="">
                    <option value="">Keine Zuordnung</option>
                    {members.map((m) => <option key={String(m.id)} value={String(m.id)}>{String(m.first_name)} {String(m.last_name)}</option>)}
                  </select>
                </label>
              </div>
              <button className="primary-button">Buchung speichern</button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Planung</span><h2>Budget setzen</h2></div></div>
            <form action={upsertBudgetAction} className="form-stack">
              <div className="form-grid">
                <label>Jahr<input name="year" type="number" defaultValue={new Date().getFullYear()} required /></label>
                <label>Betrag<input name="amount" inputMode="decimal" required /></label>
              </div>
              <label>Bereich<input name="category" required placeholder="z. B. Turniere" /></label>
              <label>Notiz<textarea name="notes" rows={3} /></label>
              <button className="primary-button">Budget speichern</button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Beiträge</span><h2>Jahresbeiträge erzeugen</h2></div></div>
            <form action={generateMembershipFeesAction} className="form-stack">
              <div className="form-grid">
                <label>Jahr<input name="year" type="number" defaultValue={currentYear} required /></label>
                <label>Beitrag pro Mitglied<input name="amount" inputMode="decimal" defaultValue={profile.default_annual_fee ?? ""} placeholder="aus Vereinsprofil" /></label>
              </div>
              <label>Fällig am<input name="dueDate" type="date" defaultValue={defaultDueDate} /></label>
              <p className="form-hint">Standardbetrag und Fälligkeit kommen aus dem Vereinsprofil. Es werden nur aktive Mitglieder ergänzt, für die in diesem Jahr noch kein Beitrag existiert.</p>
              <button className="primary-button">Beiträge erzeugen</button>
            </form>
          </article>
        </section>
      )}
    </div>
  );
}
