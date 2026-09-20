import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission, requirePermission } from "@/lib/permissions";
import {
  createMemberAccountAction,
  deleteUnusedMemberAction,
  updateMemberAction,
  updateMemberRolesAction,
} from "@/app/mitglieder/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { officialRoleKeys, roleLabel, rolePriority } from "@/lib/roles";

const statusLabels: Record<string,string> = {
  active:"Aktiv",
  passive:"Passiv",
  inactive:"Inaktiv",
};

const membershipTypeLabels: Record<string,string> = {
  regular:"Regulär",
  youth:"Jugend",
  honorary:"Ehrenmitglied",
  other:"Sonstige",
};

const feeLabels: Record<string,string> = {
  open:"Offen",
  paid:"Bezahlt",
  exempt:"Befreit",
  cancelled:"Storniert",
};

const errors: Record<string, string> = {
  missing: "Bitte die Pflichtfelder korrekt ausfüllen.",
  account: "Für den Zugang werden E-Mail und ein Passwort mit mindestens 12 Zeichen benötigt.",
  account_exists: "Für dieses Mitglied oder diese E-Mail existiert bereits ein Benutzerzugang.",
  last_admin: "Der letzte aktive Administrator kann seine Adminrolle nicht verlieren.",
  member_delete: "Dieses Mitglied besitzt bereits Vereins-, Login-, Finanz-, Team-, Sitzungs- oder Trainingshistorie. Setze es stattdessen auf Inaktiv.",
};

export const dynamic = "force-dynamic";

function dateValue(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formatDate(value: unknown) {
  if (!value) return "–";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE").format(date);
}

function money(value: unknown) {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(value));
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; account?: string; roles?: string }>;
}) {
  const actor = await requirePermission("members.read");
  const sql = getDb();
  if (!sql) notFound();

  const { id } = await params;
  const query = await searchParams;

  const [memberRows, roleRows, userRows, feeRows, historyRows, trainingSummaryRows, trainingHistoryRows] = await Promise.all([
    sql`
      SELECT
        m.id::text,
        m.member_number,
        m.first_name,
        m.last_name,
        m.nickname,
        m.email,
        m.phone,
        m.birth_date,
        m.join_date,
        m.notice_date,
        m.leave_date,
        m.status,
        m.membership_type,
        m.status_reason,
        m.status_changed_at,
        m.notes,
        COALESCE(string_agg(DISTINCT t.short_name, ', ') FILTER (WHERE t.id IS NOT NULL), '') AS teams
      FROM members m
      LEFT JOIN team_members tm ON tm.member_id = m.id AND tm.is_active = true
      LEFT JOIN teams t ON t.id = tm.team_id AND t.status = 'active' AND t.deleted_at IS NULL
      WHERE m.id = ${id}::uuid
      GROUP BY m.id
      LIMIT 1
    `,
    sql`SELECT key, name FROM roles ORDER BY name`,
    sql`
      SELECT
        u.id::text,
        u.email,
        u.status,
        u.last_login_at,
        COALESCE(array_agg(ur.role_key) FILTER (WHERE ur.role_key IS NOT NULL), ARRAY[]::text[]) AS roles
      FROM app_users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.member_id = ${id}::uuid
      GROUP BY u.id
      LIMIT 1
    `,
    sql`
      SELECT
        mf.id::text,mf.fiscal_year,mf.amount,mf.due_date,mf.status,mf.paid_on,mf.notes,
        mf.fee_type_name,mf.payment_frequency,mf.reference_text,
        CASE
          WHEN mf.status='paid'
            AND COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0)=0
          THEN mf.amount
          ELSE COALESCE((SELECT SUM(p.amount) FROM membership_fee_payments p WHERE p.fee_id=mf.id),0)
        END AS paid
      FROM membership_fees mf
      WHERE mf.member_id=${id}::uuid
      ORDER BY mf.fiscal_year DESC
      LIMIT 6
    `,
    sql`
      SELECT id::text,old_status,new_status,reason,effective_date,created_at
      FROM member_status_history
      WHERE member_id=${id}::uuid
      ORDER BY created_at DESC
      LIMIT 12
    `,
    sql`
      SELECT
        count(s.id)::int AS recorded,
        count(s.id) FILTER (WHERE a.attendance='present')::int AS attended,
        count(s.id) FILTER (WHERE a.attendance='excused')::int AS excused,
        max(s.scheduled_at) FILTER (WHERE a.attendance='present') AS last_present,
        CASE
          WHEN count(s.id)=0 THEN 0
          ELSE round(
            (count(s.id) FILTER (WHERE a.attendance='present')::numeric / count(s.id)::numeric) * 100
          )::int
        END AS activity_rate
      FROM training_attendance a
      JOIN training_sessions s ON s.id=a.session_id
      WHERE a.member_id=${id}::uuid
        AND s.attendance_recorded_at IS NOT NULL
        AND s.status='completed'
        AND EXTRACT(YEAR FROM s.scheduled_at AT TIME ZONE 'Europe/Berlin')
            = EXTRACT(YEAR FROM CURRENT_DATE)
    `,
    sql`
      SELECT
        s.id::text,
        s.scheduled_at,
        a.attendance
      FROM training_attendance a
      JOIN training_sessions s ON s.id=a.session_id
      WHERE a.member_id=${id}::uuid
        AND s.attendance_recorded_at IS NOT NULL
      ORDER BY s.scheduled_at DESC
      LIMIT 8
    `,
  ]);

  const member = memberRows[0];
  if (!member) notFound();

  const appUser = userRows[0] ?? null;
  const assignedRoles = new Set(
    appUser && Array.isArray(appUser.roles) ? appUser.roles.map(String) : []
  );
  const visibleRoleRows = roleRows
    .filter((role) => officialRoleKeys.includes(String(role.key) as (typeof officialRoleKeys)[number]))
    .sort((a, b) => rolePriority(String(a.key)) - rolePriority(String(b.key)));
  const officialRoleSet = new Set<string>(officialRoleKeys);

  const currentFee = feeRows.find((fee) => Number(fee.fiscal_year) === new Date().getFullYear()) ?? null;
  const canWrite = hasPermission(actor.roles, "members.write");
  const canManageAccounts = hasPermission(actor.roles, "settings.manage");
  const canTraining = hasPermission(actor.roles, "training.read");
  const canFinance = hasPermission(actor.roles, "finance.read");
  const trainingSummary = trainingSummaryRows[0] ?? { recorded:0,attended:0,excused:0,activity_rate:0,last_present:null };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <Link href="/mitglieder" className="back-link">← Mitglieder</Link>
          <span className="eyebrow">Mitgliedsprofil</span>
          <h1>
            {String(member.first_name)} {String(member.last_name)}
            {member.nickname ? ` „${String(member.nickname)}“` : ""}
          </h1>
          <p>
            {membershipTypeLabels[String(member.membership_type ?? "regular")] ?? "Mitglied"}
            {member.teams ? ` · ${member.teams}` : " · keine Mannschaft"}
          </p>
        </div>
        <b className={`status-badge status-${member.status}`}>{statusLabels[String(member.status)] ?? String(member.status)}</b>
      </section>

      {query.error && <div className="form-error">{errors[query.error] ?? "Die Aktion konnte nicht ausgeführt werden."}</div>}
      {(query.saved || query.account || query.roles) && <div className="form-success">Änderungen wurden gespeichert.</div>}

      <section className="member-lifecycle-summary">
        <article><span>Eintritt</span><strong>{formatDate(member.join_date)}</strong></article>
        <article><span>Kündigung</span><strong>{formatDate(member.notice_date)}</strong></article>
        <article><span>Austritt</span><strong>{formatDate(member.leave_date)}</strong></article>
        {canFinance && (
          <article>
            <span>Beitrag {new Date().getFullYear()}</span>
            <strong>{currentFee ? feeLabels[String(currentFee.status)] ?? String(currentFee.status) : "Nicht erzeugt"}</strong>
            {currentFee && (
              <small>
                {money(currentFee.paid)} von {money(currentFee.amount)} bezahlt
              </small>
            )}
          </article>
        )}
        {canTraining && (
          <article>
            <span>Training {new Date().getFullYear()}</span>
            <strong>{Number(trainingSummary.activity_rate ?? 0)}%</strong>
            <small>{Number(trainingSummary.attended ?? 0)} von {Number(trainingSummary.recorded ?? 0)} besucht</small>
          </article>
        )}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Stammdaten</span><h2>Mitglied bearbeiten</h2></div></div>
          <form action={updateMemberAction} className="form-stack">
            <input type="hidden" name="id" value={id} />
            <div className="form-grid">
              <label>Vorname<input name="firstName" defaultValue={String(member.first_name)} disabled={!canWrite} required /></label>
              <label>Nachname<input name="lastName" defaultValue={String(member.last_name)} disabled={!canWrite} required /></label>
            </div>
            <label>Spitzname
              <input
                name="nickname"
                defaultValue={member.nickname ? String(member.nickname) : ""}
                disabled={!canWrite}
                placeholder="Optional, z. B. Cyborg"
              />
            </label>
            <div className="form-grid">
              <label>E-Mail<input name="email" type="email" defaultValue={member.email ? String(member.email) : ""} disabled={!canWrite} /></label>
              <label>Telefon<input name="phone" defaultValue={member.phone ? String(member.phone) : ""} disabled={!canWrite} /></label>
            </div>
            <div className="form-grid">
              <label>Mitgliedsnummer<input name="memberNumber" defaultValue={member.member_number ? String(member.member_number) : ""} disabled={!canWrite} /></label>
              <label>Mitgliedsart
                <select name="membershipType" defaultValue={String(member.membership_type ?? "regular")} disabled={!canWrite}>
                  <option value="regular">Regulär</option>
                  <option value="youth">Jugend</option>
                  <option value="honorary">Ehrenmitglied</option>
                  <option value="other">Sonstige</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>Geburtsdatum<input name="birthDate" type="date" defaultValue={dateValue(member.birth_date)} disabled={!canWrite} /></label>
              <label>Eintritt<input name="joinDate" type="date" defaultValue={dateValue(member.join_date)} disabled={!canWrite} /></label>
            </div>

            <div className="membership-status-box">
              <div className="panel-head"><div><span className="eyebrow">Mitgliedschaft</span><h2>Status & Austritt</h2></div></div>
              <div className="form-grid">
                <label>Status
                  <select name="status" defaultValue={String(member.status)} disabled={!canWrite}>
                    <option value="active">Aktiv</option>
                    <option value="passive">Passiv</option>
                    <option value="inactive">Inaktiv</option>
                  </select>
                </label>
                <label>Statusgrund<input name="statusReason" defaultValue={member.status_reason ? String(member.status_reason) : ""} disabled={!canWrite} placeholder="z. B. Wechsel auf passiv" /></label>
              </div>
              <div className="form-grid">
                <label>Kündigung eingegangen<input name="noticeDate" type="date" defaultValue={dateValue(member.notice_date)} disabled={!canWrite} /></label>
                <label>Austritt zum<input name="leaveDate" type="date" defaultValue={dateValue(member.leave_date)} disabled={!canWrite} /></label>
              </div>
            </div>

            <label>Notizen<textarea name="notes" rows={4} defaultValue={member.notes ? String(member.notes) : ""} disabled={!canWrite} /></label>
            {canWrite && <button className="primary-button" type="submit">Änderungen speichern</button>}
          </form>
        </article>

        {canManageAccounts && (
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Administration</span><h2>Benutzer & Rollen</h2></div></div>
          {appUser ? (
            <>
              <div className="account-summary">
                <div><span>Login</span><strong>{String(appUser.email)}</strong></div>
                <div><span>Status</span><strong>{String(appUser.status)}</strong></div>
                <div><span>Letzte Anmeldung</span><strong>{appUser.last_login_at ? new Date(String(appUser.last_login_at)).toLocaleString("de-DE") : "Noch nie"}</strong></div>
              </div>
              <div className="role-chips">
                {[...assignedRoles]
                  .sort((a, b) => rolePriority(a) - rolePriority(b))
                  .map((role) => <span key={role}>{roleLabel(role)}</span>)}
                {assignedRoles.size === 0 && <span>Keine Rolle</span>}
              </div>

              {canManageAccounts && (
                <form action={updateMemberRolesAction} className="form-stack role-form">
                  <input type="hidden" name="memberId" value={id} />
                  <input type="hidden" name="userId" value={String(appUser.id)} />
                  {[...assignedRoles]
                    .filter((role) => !officialRoleSet.has(role))
                    .map((role) => <input key={role} type="hidden" name="roles" value={role} />)}
                  <div className="checkbox-grid">
                    {visibleRoleRows.map((role) => (
                      <label className="checkbox-row" key={String(role.key)}>
                        <input
                          type="checkbox"
                          name="roles"
                          value={String(role.key)}
                          defaultChecked={assignedRoles.has(String(role.key))}
                        />
                        <span>{String(role.name)}</span>
                      </label>
                    ))}
                  </div>
                  <button className="primary-button" type="submit">Rollen speichern</button>
                </form>
              )}
            </>
          ) : (
            <>
              <p>Für dieses Mitglied existiert noch kein Login für VDC Club.</p>
              {canManageAccounts && (
                <form action={createMemberAccountAction} className="form-stack">
                  <input type="hidden" name="memberId" value={id} />
                  <label>Login-E-Mail
                    <input name="email" type="email" defaultValue={member.email ? String(member.email) : ""} required />
                  </label>
                  <label>Startpasswort
                    <input name="password" type="password" minLength={12} required />
                  </label>
                  <div className="checkbox-grid">
                    {visibleRoleRows.map((role) => (
                      <label className="checkbox-row" key={String(role.key)}>
                        <input type="checkbox" name="roles" value={String(role.key)} />
                        <span>{String(role.name)}</span>
                      </label>
                    ))}
                  </div>
                  <button className="primary-button" type="submit">Zugang anlegen</button>
                </form>
              )}
            </>
          )}
        </article>
        )}
      </section>

      <section className="panel-grid">
        {canTraining && (
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Training</span><h2>Trainingsaktivität</h2></div>
              <Link href="/training" className="text-link">Training</Link>
            </div>
            <div className="member-training-summary">
              <div><span>Aktivität</span><strong>{Number(trainingSummary.activity_rate ?? 0)}%</strong></div>
              <div><span>Besucht</span><strong>{Number(trainingSummary.attended ?? 0)}/{Number(trainingSummary.recorded ?? 0)}</strong></div>
              <div><span>Zuletzt da</span><strong>{formatDate(trainingSummary.last_present)}</strong></div>
            </div>
            <div className="member-training-history">
              {trainingHistoryRows.length===0 ? (
                <div className="empty-state">Noch keine erfassten Trainingstage für dieses Mitglied.</div>
              ) : trainingHistoryRows.map((training)=>(
                <Link href={`/training/${training.id}`} key={String(training.id)}>
                  <span>{formatDate(training.scheduled_at)}</span>
                  <strong>
                    {training.attendance==="present"
                      ? "Anwesend"
                      : training.attendance==="excused"
                        ? "Entschuldigt"
                        : "Nicht anwesend"}
                  </strong>
                </Link>
              ))}
            </div>
          </article>
        )}

        {canFinance && (
          <article className="panel">
            <div className="panel-head">
              <div><span className="eyebrow">Beiträge</span><h2>Beitragsverlauf</h2></div>
              <Link href="/finanzen/beitraege" className="ghost-button">Beiträge verwalten</Link>
            </div>
            <div className="member-fee-list">
              {feeRows.length === 0 ? (
                <div className="empty-state">Noch keine Beiträge für dieses Mitglied erzeugt.</div>
              ) : feeRows.map((fee) => {
                const paid=Number(fee.paid ?? 0);
                const total=Number(fee.amount ?? 0);
                const remaining=Math.max(0,total-paid);
                return (
                  <div className="member-fee-row member-fee-row-extended" key={String(fee.id)}>
                    <div>
                      <strong>{String(fee.fiscal_year)} · {String(fee.fee_type_name || "Standard")}</strong>
                      <span>
                        Fällig {formatDate(fee.due_date)}
                        {fee.reference_text ? ` · ${fee.reference_text}` : ""}
                      </span>
                    </div>
                    <div className="member-fee-money">
                      <strong>{money(paid)} / {money(total)}</strong>
                      <span>{remaining > 0 ? `${money(remaining)} offen` : "vollständig bezahlt"}</span>
                    </div>
                    <span className={`fee-status fee-${fee.status}`}>{feeLabels[String(fee.status)] ?? String(fee.status)}</span>
                  </div>
                );
              })}
            </div>
          </article>
        )}

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Historie</span><h2>Statusänderungen</h2></div></div>
          <div className="member-history-list">
            {historyRows.length === 0 ? (
              <div className="empty-state">Noch keine Statusänderungen protokolliert.</div>
            ) : historyRows.map((history) => (
              <div className="member-history-row" key={String(history.id)}>
                <div>
                  <strong>{statusLabels[String(history.old_status)] ?? String(history.old_status ?? "Neu")} → {statusLabels[String(history.new_status)] ?? String(history.new_status)}</strong>
                  <span>{formatDate(history.effective_date)}</span>
                </div>
                <div>{history.reason && <small>{String(history.reason)}</small>}</div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {canManageAccounts && (
        <article className="panel destructive-zone">
          <span className="eyebrow">Gefahrenbereich</span>
          <h2>Fehleingabe endgültig löschen</h2>
          <p>Nur ein vollständig unbenutztes Mitglied ohne Login, Mannschaft, Beiträge, Finanzen, Sitzungen, Aufgaben, Dokumente, Training oder Importverknüpfung kann gelöscht werden. Für echte Austritte den Mitgliedsstatus verwenden.</p>
          <form action={deleteUnusedMemberAction}>
            <input type="hidden" name="id" value={id} />
            <ConfirmSubmitButton
              message={"Mitglied „"+String(member.first_name)+" "+String(member.last_name)+"“ endgültig löschen? Das funktioniert nur, wenn keinerlei Vereinshistorie existiert."}
              requireText="LÖSCHEN"
            >
              Unbenutztes Mitglied endgültig löschen
            </ConfirmSubmitButton>
          </form>
        </article>
      )}
    </div>
  );
}
