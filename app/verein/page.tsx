import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { updateClubProfileAction } from "@/app/verein/actions";

export const dynamic = "force-dynamic";

function dateValue(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function money(value: unknown) {
  if (value === null || value === undefined || value === "") return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value));
}

export default async function ClubProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const actor = await requirePermission("members.read");
  const sql = getDb();
  const params = await searchParams;
  const canWrite = hasPermission(actor.roles, "members.write");

  const [profileRows, summaryRows, recentChanges] = sql
    ? await Promise.all([
        sql`SELECT * FROM club_profile WHERE id=1 LIMIT 1`,
        sql`
          SELECT
            count(*) FILTER (WHERE status='active')::int AS active,
            count(*) FILTER (WHERE status='passive')::int AS passive,
            count(*) FILTER (WHERE status='inactive')::int AS inactive,
            count(*) FILTER (
              WHERE notice_date IS NOT NULL
                AND (leave_date IS NULL OR leave_date >= CURRENT_DATE)
            )::int AS notices,
            count(*) FILTER (
              WHERE join_date >= date_trunc('year',CURRENT_DATE)::date
            )::int AS joined_year,
            count(*) FILTER (
              WHERE leave_date >= date_trunc('year',CURRENT_DATE)::date
                AND leave_date < (date_trunc('year',CURRENT_DATE) + interval '1 year')::date
            )::int AS left_year
          FROM members
        `,
        sql`
          SELECT
            h.id::text,
            h.old_status,
            h.new_status,
            h.reason,
            h.effective_date,
            m.first_name,
            m.last_name
          FROM member_status_history h
          JOIN members m ON m.id=h.member_id
          ORDER BY h.created_at DESC
          LIMIT 8
        `,
      ])
    : [[], [{ active:0, passive:0, inactive:0, notices:0, joined_year:0, left_year:0 }], []];

  const profile = profileRows[0] ?? {
    club_name:"Vestischer Dart Club e.V.",
    short_name:"VDC",
    legal_form:"e.V.",
    city:"Marl",
    fiscal_year_start_month:1,
  };
  const summary = summaryRows[0] ?? {};

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Verein</span>
          <h1>Vereinsprofil</h1>
          <p>Stammdaten, Beitragsgrundlagen und Mitgliederbewegungen des Vereins an einer Stelle.</p>
        </div>
      </section>

      {params.error && <div className="form-error">Die Vereinsdaten konnten nicht gespeichert werden.</div>}
      {params.saved && <div className="form-success">Vereinsprofil wurde aktualisiert.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Aktiv</span><strong>{Number(summary.active ?? 0)}</strong><small>Mitglieder</small></article>
        <article className="stat-card"><span>Passiv</span><strong>{Number(summary.passive ?? 0)}</strong><small>Mitglieder</small></article>
        <article className="stat-card"><span>Kündigungen</span><strong>{Number(summary.notices ?? 0)}</strong><small>vorgemerkt</small></article>
        <article className="stat-card"><span>Beitrag</span><strong>{money(profile.default_annual_fee)}</strong><small>Standard pro Jahr</small></article>
      </section>

      <section className="club-profile-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Stammdaten</span><h2>Verein</h2></div></div>
          <form action={updateClubProfileAction} className="form-stack">
            <div className="form-grid">
              <label>Vereinsname<input name="clubName" defaultValue={String(profile.club_name ?? "")} disabled={!canWrite} required /></label>
              <label>Kurzname<input name="shortName" defaultValue={String(profile.short_name ?? "")} disabled={!canWrite} required /></label>
            </div>
            <div className="form-grid">
              <label>Rechtsform<input name="legalForm" defaultValue={String(profile.legal_form ?? "")} disabled={!canWrite} /></label>
              <label>Gründungsdatum<input name="foundedOn" type="date" defaultValue={dateValue(profile.founded_on)} disabled={!canWrite} /></label>
            </div>
            <label>Straße<input name="street" defaultValue={String(profile.street ?? "")} disabled={!canWrite} /></label>
            <div className="form-grid">
              <label>PLZ<input name="postalCode" defaultValue={String(profile.postal_code ?? "")} disabled={!canWrite} /></label>
              <label>Ort<input name="city" defaultValue={String(profile.city ?? "")} disabled={!canWrite} /></label>
            </div>
            <div className="form-grid">
              <label>E-Mail<input name="email" type="email" defaultValue={String(profile.email ?? "")} disabled={!canWrite} /></label>
              <label>Telefon<input name="phone" defaultValue={String(profile.phone ?? "")} disabled={!canWrite} /></label>
            </div>
            <label>Website<input name="website" type="url" defaultValue={String(profile.website ?? "")} disabled={!canWrite} /></label>

            <div className="panel-head club-profile-subhead"><div><span className="eyebrow">Finanzen</span><h2>Beitragsgrundlage</h2></div></div>
            <div className="form-grid">
              <label>Standard-Jahresbeitrag<input name="defaultAnnualFee" inputMode="decimal" defaultValue={profile.default_annual_fee ?? ""} disabled={!canWrite} /></label>
              <label>Geschäftsjahr startet im Monat
                <input name="fiscalYearStartMonth" type="number" min="1" max="12" defaultValue={Number(profile.fiscal_year_start_month ?? 1)} disabled={!canWrite} />
              </label>
            </div>
            <div className="form-grid">
              <label>Beitrag fällig im Monat<input name="feeDueMonth" type="number" min="1" max="12" defaultValue={profile.fee_due_month ?? ""} disabled={!canWrite} /></label>
              <label>Beitrag fällig am Tag<input name="feeDueDay" type="number" min="1" max="31" defaultValue={profile.fee_due_day ?? ""} disabled={!canWrite} /></label>
            </div>
            <label>Interne Notiz<textarea name="notes" rows={4} defaultValue={String(profile.notes ?? "")} disabled={!canWrite} /></label>
            {canWrite && <button className="primary-button">Vereinsprofil speichern</button>}
          </form>
        </article>

        <div className="club-profile-side">
          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Bewegung</span><h2>Dieses Jahr</h2></div></div>
            <div className="club-movement-grid">
              <div><span>Eintritte</span><strong>+{Number(summary.joined_year ?? 0)}</strong></div>
              <div><span>Austritte</span><strong>−{Number(summary.left_year ?? 0)}</strong></div>
              <div><span>Inaktiv</span><strong>{Number(summary.inactive ?? 0)}</strong></div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-head"><div><span className="eyebrow">Historie</span><h2>Letzte Statusänderungen</h2></div></div>
            <div className="member-history-list">
              {recentChanges.length === 0 ? (
                <div className="empty-state">Noch keine Statusänderungen protokolliert.</div>
              ) : recentChanges.map((change) => (
                <div className="member-history-row" key={String(change.id)}>
                  <div>
                    <strong>{String(change.first_name)} {String(change.last_name)}</strong>
                    <span>{String(change.old_status ?? "neu")} → {String(change.new_status)}</span>
                  </div>
                  <div>
                    <b>{new Intl.DateTimeFormat("de-DE").format(new Date(String(change.effective_date)))}</b>
                    {change.reason && <small>{String(change.reason)}</small>}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
