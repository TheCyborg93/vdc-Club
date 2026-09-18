import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  createSponsorAction,
  deleteUnusedSponsorAction,
  updateSponsorStatusAction,
} from "@/app/sponsoren/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export const dynamic = "force-dynamic";

const statusLabels: Record<string,string> = {
  lead: "Kontakt",
  active: "Aktiv",
  expired: "Abgelaufen",
  inactive: "Inaktiv",
};

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(date);
}

export default async function SponsorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string }>;
}) {
  const actor = await requirePermission("sponsors.read");
  const sql = getDb();
  const params = await searchParams;
  const canWrite = hasPermission(actor.roles, "sponsors.write");
  const isAdmin = actor.roles.includes("admin");

  const [sponsors, counts] = sql
    ? await Promise.all([
        sql`
          SELECT
            id::text, name, contact_name, email, phone,
            contract_start, contract_end, contribution_text, club_benefits, status
          FROM sponsors
          ORDER BY
            CASE status WHEN 'active' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END,
            name
        `,
        sql`
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE status = 'active')::int AS active,
            count(*) FILTER (WHERE status = 'lead')::int AS leads,
            count(*) FILTER (
              WHERE status = 'active'
                AND contract_end IS NOT NULL
                AND contract_end <= CURRENT_DATE + interval '60 days'
            )::int AS expiring
          FROM sponsors
        `,
      ])
    : [[], [{ total:0, active:0, leads:0, expiring:0 }]];

  const c = counts[0] ?? {};

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Finanzen & Partnerschaften</span>
          <h1>Sponsoren</h1>
          <p>Partner, Ansprechpartner, Vertragslaufzeiten sowie gegenseitige Leistungen zentral im Blick.</p>
        </div>
      </section>

      {params.error && (
        <div className="form-error">
          {params.error==="sponsor_delete"
            ? "Dieser Sponsor kann nicht endgültig gelöscht werden. Nur Kontakte/Inaktive ohne verknüpfte Dokumente sind löschbar."
            : "Die Sponsorendaten konnten nicht gespeichert werden."}
        </div>
      )}
      {params.created && <div className="form-success">Sponsor wurde angelegt.</div>}
      {params.deleted && <div className="form-success">Unbenutzter Sponsor wurde endgültig gelöscht.</div>}

      <section className="stat-grid">
        <article className="stat-card"><span>Sponsoren</span><strong>{Number(c.total ?? 0)}</strong><small>gesamt</small></article>
        <article className="stat-card"><span>Aktiv</span><strong>{Number(c.active ?? 0)}</strong><small>laufende Partnerschaften</small></article>
        <article className="stat-card"><span>Kontakte</span><strong>{Number(c.leads ?? 0)}</strong><small>noch ohne Vertrag</small></article>
        <article className="stat-card"><span>Läuft bald aus</span><strong>{Number(c.expiring ?? 0)}</strong><small>innerhalb 60 Tagen</small></article>
      </section>

      <section className={canWrite ? "management-grid" : "management-grid single"}>
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Partner</span><h2>Sponsorenübersicht</h2></div><span className="count-chip">{sponsors.length}</span></div>
          <div className="sponsor-list">
            {sponsors.length === 0 ? <div className="empty-state">Noch keine Sponsoren hinterlegt.</div> : sponsors.map((s) => (
              <article className="sponsor-card" key={String(s.id)}>
                <div className="sponsor-card-head">
                  <div>
                    <strong>{String(s.name)}</strong>
                    <span>{s.contact_name ? String(s.contact_name) : "Kein Ansprechpartner"}</span>
                  </div>
                  <span className={`sponsor-status sponsor-${s.status}`}>{statusLabels[String(s.status)] ?? String(s.status)}</span>
                </div>
                <div className="sponsor-meta">
                  <span>{s.email ? String(s.email) : "Keine E-Mail"}</span>
                  <span>{s.phone ? String(s.phone) : "Kein Telefon"}</span>
                  <span>{formatDate(s.contract_start)} – {formatDate(s.contract_end)}</span>
                </div>
                {(s.contribution_text || s.club_benefits) && (
                  <div className="sponsor-benefits">
                    {s.contribution_text && <div><span>Sponsor leistet</span><p>{String(s.contribution_text)}</p></div>}
                    {s.club_benefits && <div><span>Verein leistet</span><p>{String(s.club_benefits)}</p></div>}
                  </div>
                )}
                {canWrite && (
                  <>
                    <form action={updateSponsorStatusAction} className="sponsor-status-form">
                      <input type="hidden" name="id" value={String(s.id)} />
                      <select name="status" defaultValue={String(s.status)}>
                        <option value="lead">Kontakt</option>
                        <option value="active">Aktiv</option>
                        <option value="expired">Abgelaufen</option>
                        <option value="inactive">Inaktiv</option>
                      </select>
                      <button className="mini-button">Status speichern</button>
                    </form>
                    {isAdmin && ["lead","inactive"].includes(String(s.status)) && (
                      <form action={deleteUnusedSponsorAction} className="destructive-inline-form">
                        <input type="hidden" name="id" value={String(s.id)} />
                        <ConfirmSubmitButton
                          message={"Sponsor „"+String(s.name)+"“ endgültig löschen? Das funktioniert nur ohne verknüpfte Dokumente."}
                          requireText="LÖSCHEN"
                        >
                          Endgültig löschen
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </>
                )}
              </article>
            ))}
          </div>
        </article>

        {canWrite && (
          <article className="panel sticky-panel">
            <div className="panel-head"><div><span className="eyebrow">Neu</span><h2>Sponsor anlegen</h2></div></div>
            <form action={createSponsorAction} className="form-stack">
              <label>Name<input name="name" required /></label>
              <label>Ansprechpartner<input name="contactName" /></label>
              <div className="form-grid">
                <label>E-Mail<input name="email" type="email" /></label>
                <label>Telefon<input name="phone" /></label>
              </div>
              <div className="form-grid">
                <label>Vertragsbeginn<input name="contractStart" type="date" /></label>
                <label>Vertragsende<input name="contractEnd" type="date" /></label>
              </div>
              <label>Status
                <select name="status" defaultValue="active">
                  <option value="lead">Kontakt</option>
                  <option value="active">Aktiv</option>
                  <option value="expired">Abgelaufen</option>
                  <option value="inactive">Inaktiv</option>
                </select>
              </label>
              <label>Leistung Sponsor<textarea name="contributionText" rows={3} placeholder="z. B. Geldbetrag, Material, Trikots" /></label>
              <label>Leistung Verein<textarea name="clubBenefits" rows={3} placeholder="z. B. Logo, Social Media, Banner" /></label>
              <button className="primary-button">Sponsor speichern</button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
