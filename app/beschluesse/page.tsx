import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  createResolutionTaskAction,
  updateResolutionImplementationAction,
  updateResolutionStatusAction,
} from "@/app/beschluesse/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { taskStatusLabel } from "@/lib/ui-labels";

const voteMethodLabels:Record<string,string>={
  open:"Offen",
  show_of_hands:"Handzeichen",
  roll_call:"Namentlich",
  secret:"Geheim",
  electronic:"Elektronisch",
};

const statusLabels:Record<string,string>={
  open:"Offen",
  in_progress:"In Umsetzung",
  implemented:"Umgesetzt",
  withdrawn:"Aufgehoben",
  rejected:"Abgelehnt",
};

const errorLabels:Record<string,string>={
  database:"Die Datenbank ist nicht verfügbar.",
  missing:"Der Beschluss wurde nicht gefunden.",
  withdrawn:"Ein aufgehobener Beschluss bleibt historisch abgeschlossen. Für eine neue Entscheidung bitte einen neuen Beschluss erfassen.",
  rejected:"Ein abgelehnter Antrag bleibt als Abstimmungsergebnis unveränderbar dokumentiert.",
  task_unavailable:"Es konnte keine Folgeaufgabe angelegt werden. Der Beschluss ist bereits abgeschlossen oder es existiert bereits eine aktive Folgeaufgabe.",
};

export const dynamic="force-dynamic";

function meetingResolutionHref(resolution:Record<string,unknown>) {
  if(String(resolution.source_system)!=="v3" || !resolution.meeting_id) return null;
  const id=String(resolution.meeting_id);
  const state=String(resolution.meeting_status ?? "");
  if(state==="live") return `/sitzungen/${id}/live`;
  if(state==="ready") return `/sitzungen/${id}/start`;
  if(state==="closing") return `/sitzungen/${id}/close`;
  if(["minutes_draft","minutes_review","archived"].includes(state)) return `/sitzungen/${id}/minutes`;
  return `/sitzungen/${id}`;
}

function formatDate(value:unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    day:"2-digit",
    month:"2-digit",
    year:"numeric",
    timeZone:"Europe/Berlin",
  }).format(date);
}

export default async function ResolutionsPage({
  searchParams,
}:{
  searchParams:Promise<{
    error?:string;
    task?:string;
    saved?:string;
    q?:string;
    status?:string;
    year?:string;
    view?:string;
  }>;
}) {
  const actor=await requirePermission("resolutions.read");
  const sql=getDb();
  const params=await searchParams;

  const q=(params.q ?? "").trim();
  const status=["open","in_progress","implemented","withdrawn","rejected"].includes(params.status ?? "")
    ? String(params.status)
    : "";
  const yearNum=/^\d{4}$/.test(params.year ?? "") ? Number(params.year) : null;
  const requestedView=["active","overdue","implemented","all"].includes(params.view ?? "")
    ? String(params.view)
    : "active";
  const view=status ? "all" : requestedView;

  const [legacyResolutions,counts,members,legacyYears,v3Resolutions,v3Counts,v3Years]=sql
    ? await Promise.all([
        sql`
          SELECT
            r.id::text,
            'legacy'::text AS source_system,
            r.resolution_number,
            r.title,
            r.decision_text,
            r.votes_yes,
            r.votes_no,
            r.votes_abstain,
            r.vote_method,
            r.vote_details,
            r.eligible_voters,
            r.excluded_voters,
            r.decision_outcome,
            r.status,
            r.decided_at,
            r.implemented_at,
            r.implementation_notes,
            m.id::text AS meeting_id,
            m.title AS meeting_title,
            m.status AS meeting_status,
            ai.position AS agenda_position,
            ai.title AS agenda_title,
            t.id::text AS task_id,
            t.title AS task_title,
            t.status AS task_status,
            t.due_date AS task_due_date,
            (t.due_date<CURRENT_DATE AND t.status IN ('open','in_progress','blocked')) AS task_overdue,
            owner.first_name AS owner_first_name,
            owner.last_name AS owner_last_name
          FROM resolutions r
          LEFT JOIN meetings m ON m.id=r.meeting_id
          LEFT JOIN agenda_items ai ON ai.id=r.agenda_item_id
          LEFT JOIN LATERAL (
            SELECT tx.*
            FROM tasks tx
            WHERE tx.source_type='resolution'
              AND tx.source_id=r.id
              AND tx.deleted_at IS NULL
              AND tx.status<>'cancelled'
            ORDER BY tx.created_at DESC
            LIMIT 1
          ) t ON true
          LEFT JOIN members owner ON owner.id=t.owner_member_id
          WHERE
            NOT (
              r.meeting_id IS NULL
              AND r.agenda_item_id IS NULL
              AND r.vote_method IS NULL
              AND r.decision_outcome IS NULL
              AND r.eligible_voters IS NULL
            )
            AND (${q}='' OR
              COALESCE(r.resolution_number,'') ILIKE '%' || ${q} || '%' OR
              r.title ILIKE '%' || ${q} || '%' OR
              r.decision_text ILIKE '%' || ${q} || '%' OR
              COALESCE(r.implementation_notes,'') ILIKE '%' || ${q} || '%')
            AND (
              ${status}=''
              OR (${status}='rejected' AND r.decision_outcome='rejected')
              OR (${status}<>'rejected' AND r.status=${status} AND COALESCE(r.decision_outcome,'accepted')<>'rejected')
            )
            AND (
              ${view}='all'
              OR (
                ${view}='active'
                AND COALESCE(r.decision_outcome,'accepted')<>'rejected'
                AND r.status IN ('open','in_progress')
              )
              OR (
                ${view}='overdue'
                AND COALESCE(r.decision_outcome,'accepted')<>'rejected'
                AND r.status IN ('open','in_progress')
                AND t.due_date<CURRENT_DATE
                AND t.status IN ('open','in_progress','blocked')
              )
              OR (
                ${view}='implemented'
                AND (
                  r.status IN ('implemented','withdrawn')
                  OR r.decision_outcome='rejected'
                )
              )
            )
            AND (${yearNum}::int IS NULL OR EXTRACT(YEAR FROM r.decided_at)::int=${yearNum}::int)
          ORDER BY
            CASE
              WHEN t.due_date<CURRENT_DATE AND t.status IN ('open','in_progress','blocked') THEN 0
              WHEN r.status='in_progress' THEN 1
              WHEN r.status='open' THEN 2
              ELSE 3
            END,
            t.due_date NULLS LAST,
            r.decided_at DESC,
            r.resolution_number DESC
        `,
        sql`
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE status='implemented' AND COALESCE(decision_outcome,'accepted')<>'rejected')::int AS implemented,
            count(*) FILTER (WHERE status='in_progress' AND COALESCE(decision_outcome,'accepted')<>'rejected')::int AS progress,
            count(*) FILTER (WHERE status='open' AND COALESCE(decision_outcome,'accepted')<>'rejected')::int AS open,
            count(*) FILTER (
              WHERE status='withdrawn' AND COALESCE(decision_outcome,'accepted')<>'rejected'
            )::int AS withdrawn,
            count(*) FILTER (WHERE decision_outcome='rejected')::int AS rejected,
            count(*) FILTER (
              WHERE COALESCE(decision_outcome,'accepted')<>'rejected'
                AND status IN ('open','in_progress')
                AND EXISTS (
                  SELECT 1
                  FROM tasks tx
                  WHERE tx.source_type='resolution'
                    AND tx.source_id=resolutions.id
                    AND tx.deleted_at IS NULL
                    AND tx.status IN ('open','in_progress','blocked')
                    AND tx.due_date<CURRENT_DATE
                )
            )::int AS overdue
          FROM resolutions
          WHERE
            NOT (
              meeting_id IS NULL
              AND agenda_item_id IS NULL
              AND vote_method IS NULL
              AND decision_outcome IS NULL
              AND eligible_voters IS NULL
            )
            AND (${q}='' OR
              COALESCE(resolution_number,'') ILIKE '%' || ${q} || '%' OR
              title ILIKE '%' || ${q} || '%' OR
              decision_text ILIKE '%' || ${q} || '%' OR
              COALESCE(implementation_notes,'') ILIKE '%' || ${q} || '%')
            AND (${yearNum}::int IS NULL OR EXTRACT(YEAR FROM decided_at)::int=${yearNum}::int)
        `,
        sql`
          SELECT id::text,first_name,last_name
          FROM members
          WHERE status='active'
          ORDER BY last_name,first_name
        `,
        sql`
          SELECT DISTINCT EXTRACT(YEAR FROM decided_at)::int AS year
          FROM resolutions
          WHERE NOT (
              meeting_id IS NULL
              AND agenda_item_id IS NULL
              AND vote_method IS NULL
              AND decision_outcome IS NULL
              AND eligible_voters IS NULL
            )
          ORDER BY year DESC
        `,
        sql`
          SELECT
            r.id::text,
            'v3'::text AS source_system,
            r.resolution_number,
            r.title,
            r.decision_text,
            r.votes_yes,
            r.votes_no,
            r.votes_abstain,
            r.vote_method,
            (
              SELECT string_agg(
                COALESCE(mv.first_name || ' ' || mv.last_name,nv.person_name,'Unbekannt')
                || ': ' ||
                CASE nv.vote WHEN 'yes' THEN 'Ja' WHEN 'no' THEN 'Nein' ELSE 'Enthaltung' END,
                ', ' ORDER BY COALESCE(mv.last_name,nv.person_name),mv.first_name
              )
              FROM meeting_v3_named_votes nv
              LEFT JOIN members mv ON mv.id=nv.member_id
              WHERE nv.resolution_id=r.id
            ) AS vote_details,
            r.eligible_voters,
            r.excluded_voters,
            r.decision_outcome,
            r.implementation_status AS status,
            r.decided_at,
            r.implemented_at,
            r.implementation_notes,
            m.id::text AS meeting_id,
            m.title AS meeting_title,
            m.lifecycle_state AS meeting_status,
            ai.position AS agenda_position,
            ai.title AS agenda_title,
            t.id::text AS task_id,
            t.title AS task_title,
            t.status AS task_status,
            t.due_date AS task_due_date,
            (t.due_date<CURRENT_DATE AND t.status IN ('open','in_progress','blocked')) AS task_overdue,
            owner.first_name AS owner_first_name,
            owner.last_name AS owner_last_name
          FROM meeting_v3_resolutions r
          JOIN meeting_v3_meetings m ON m.id=r.meeting_id
          JOIN meeting_v3_agenda_items ai ON ai.id=r.agenda_item_id
          LEFT JOIN LATERAL (
            SELECT tx.*
            FROM tasks tx
            WHERE tx.source_type='meeting_v3_resolution'
              AND tx.source_id=r.id
              AND tx.deleted_at IS NULL
              AND tx.status<>'cancelled'
            ORDER BY tx.created_at DESC
            LIMIT 1
          ) t ON true
          LEFT JOIN members owner ON owner.id=t.owner_member_id
          WHERE
            (${q}='' OR
              COALESCE(r.resolution_number,'') ILIKE '%' || ${q} || '%' OR
              r.title ILIKE '%' || ${q} || '%' OR
              r.decision_text ILIKE '%' || ${q} || '%' OR
              COALESCE(r.implementation_notes,'') ILIKE '%' || ${q} || '%')
            AND (
              ${status}=''
              OR (${status}='rejected' AND r.decision_outcome='rejected')
              OR (${status}<>'rejected' AND r.implementation_status=${status} AND r.decision_outcome<>'rejected')
            )
            AND (
              ${view}='all'
              OR (
                ${view}='active'
                AND r.decision_outcome<>'rejected'
                AND r.implementation_status IN ('open','in_progress')
              )
              OR (
                ${view}='overdue'
                AND r.decision_outcome<>'rejected'
                AND r.implementation_status IN ('open','in_progress')
                AND t.due_date<CURRENT_DATE
                AND t.status IN ('open','in_progress','blocked')
              )
              OR (
                ${view}='implemented'
                AND (
                  r.implementation_status IN ('implemented','withdrawn')
                  OR r.decision_outcome='rejected'
                )
              )
            )
            AND (${yearNum}::int IS NULL OR EXTRACT(YEAR FROM r.decided_at)::int=${yearNum}::int)
          ORDER BY r.decided_at DESC
        `,
        sql`
          SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE implementation_status='implemented' AND decision_outcome<>'rejected')::int AS implemented,
            count(*) FILTER (WHERE implementation_status='in_progress' AND decision_outcome<>'rejected')::int AS progress,
            count(*) FILTER (WHERE implementation_status='open' AND decision_outcome<>'rejected')::int AS open,
            count(*) FILTER (WHERE implementation_status='withdrawn' AND decision_outcome<>'rejected')::int AS withdrawn,
            count(*) FILTER (WHERE decision_outcome='rejected')::int AS rejected,
            count(*) FILTER (
              WHERE decision_outcome<>'rejected'
                AND implementation_status IN ('open','in_progress')
                AND EXISTS (
                  SELECT 1 FROM tasks tx
                  WHERE tx.source_type='meeting_v3_resolution'
                    AND tx.source_id=meeting_v3_resolutions.id
                    AND tx.deleted_at IS NULL
                    AND tx.status IN ('open','in_progress','blocked')
                    AND tx.due_date<CURRENT_DATE
                )
            )::int AS overdue
          FROM meeting_v3_resolutions
          WHERE
            (${q}='' OR
              COALESCE(resolution_number,'') ILIKE '%' || ${q} || '%' OR
              title ILIKE '%' || ${q} || '%' OR
              decision_text ILIKE '%' || ${q} || '%' OR
              COALESCE(implementation_notes,'') ILIKE '%' || ${q} || '%')
            AND (${yearNum}::int IS NULL OR EXTRACT(YEAR FROM decided_at)::int=${yearNum}::int)
        `,
        sql`
          SELECT DISTINCT EXTRACT(YEAR FROM decided_at)::int AS year
          FROM meeting_v3_resolutions
          ORDER BY year DESC
        `,
      ])
    : [
        [],
        [{total:0,implemented:0,progress:0,open:0,withdrawn:0,rejected:0,overdue:0}],
        [],
        [],
        [],
        [{total:0,implemented:0,progress:0,open:0,withdrawn:0,rejected:0,overdue:0}],
        [],
      ];

  const legacyCount=counts[0] ?? {};
  const newCount=v3Counts[0] ?? {};
  const count={
    total:Number(legacyCount.total ?? 0)+Number(newCount.total ?? 0),
    implemented:Number(legacyCount.implemented ?? 0)+Number(newCount.implemented ?? 0),
    progress:Number(legacyCount.progress ?? 0)+Number(newCount.progress ?? 0),
    open:Number(legacyCount.open ?? 0)+Number(newCount.open ?? 0),
    withdrawn:Number(legacyCount.withdrawn ?? 0)+Number(newCount.withdrawn ?? 0),
    rejected:Number(legacyCount.rejected ?? 0)+Number(newCount.rejected ?? 0),
    overdue:Number(legacyCount.overdue ?? 0)+Number(newCount.overdue ?? 0),
  };
  const resolutions=[...legacyResolutions,...v3Resolutions].sort((a,b)=>{
    const overdueDiff=Number(Boolean(b.task_overdue))-Number(Boolean(a.task_overdue));
    if(overdueDiff) return overdueDiff;
    const rank=(row:Record<string,unknown>)=>String(row.status)==="in_progress" ? 0 : String(row.status)==="open" ? 1 : 2;
    const statusDiff=rank(a)-rank(b);
    if(statusDiff) return statusDiff;
    return new Date(String(b.decided_at)).getTime()-new Date(String(a.decided_at)).getTime();
  });
  const yearSet=new Set<number>();
  for(const row of [...legacyYears,...v3Years]){
    const year=Number(row.year);
    if(Number.isInteger(year)) yearSet.add(year);
  }
  const years=[...yearSet].sort((a,b)=>b-a).map((year)=>({year}));
  const canWrite=hasPermission(actor.roles,"resolutions.write");
  const canCreateTasks=hasPermission(actor.roles,"tasks.write");

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Organisation</span>
          <h1>Beschlüsse</h1>
          <p>Beschlussbuch mit Abstimmung, Herkunft, Folgeaufgabe und dokumentierter Umsetzung.</p>
        </div>
        <a href="/api/export/beschluesse" className="ghost-button">CSV Export</a>
      </section>

      {params.error && (
        <div className="form-error">
          {errorLabels[params.error] ?? "Die Aktion konnte nicht ausgeführt werden."}
        </div>
      )}
      {params.task && <div className="form-success">Folgeaufgabe wurde angelegt.</div>}
      {params.saved && <div className="form-success">Beschluss wurde aktualisiert.</div>}

      <nav className="resolution-view-tabs" aria-label="Beschlüsse filtern">
        <Link href="/beschluesse" className={view==="active" ? "is-active" : ""}>
          Aktiv
          <span>{Number(count.open ?? 0)+Number(count.progress ?? 0)}</span>
        </Link>
        <Link href="/beschluesse?view=overdue" className={view==="overdue" ? "is-active is-warning" : ""}>
          Überfällig
          <span>{Number(count.overdue ?? 0)}</span>
        </Link>
        <Link href="/beschluesse?view=implemented" className={view==="implemented" ? "is-active" : ""}>
          Abgeschlossen
          <span>{Number(count.implemented ?? 0)+Number(count.withdrawn ?? 0)+Number(count.rejected ?? 0)}</span>
        </Link>
        <Link href="/beschluesse?view=all" className={view==="all" ? "is-active" : ""}>
          Alle
          <span>{Number(count.total ?? 0)}</span>
        </Link>
      </nav>

      <section className="stat-grid">
        <article className="stat-card">
          <span>Beschlüsse</span>
          <strong>{Number(count.total ?? 0)}</strong>
          <small>{yearNum ? "im Jahr "+String(yearNum) : "im gewählten Bereich"}</small>
        </article>
        <article className="stat-card">
          <span>Umgesetzt</span>
          <strong>{Number(count.implemented ?? 0)}</strong>
          <small>abgeschlossen</small>
        </article>
        <article className="stat-card">
          <span>In Umsetzung</span>
          <strong>{Number(count.progress ?? 0)}</strong>
          <small>laufend</small>
        </article>
        <article className="stat-card">
          <span>Offen</span>
          <strong>{Number(count.open ?? 0)}</strong>
          <small>noch ohne Abschluss</small>
        </article>
        <article className="stat-card">
          <span>Abgelehnt</span>
          <strong>{Number(count.rejected ?? 0)}</strong>
          <small>historisch dokumentiert</small>
        </article>
      </section>

      <details className="panel resolution-filter-panel" open={Boolean(q || yearNum || status)}>
        <summary className="resolution-filter-summary">
          <div>
            <span className="eyebrow">Feinfilter</span>
            <strong>Suche, Jahr & Status</strong>
          </div>
          <span>{q || yearNum || status ? "Filter aktiv" : "Optional"}</span>
        </summary>
        <form method="get" className="resolution-filter-form">
          <input type="hidden" name="view" value={view} />
          <label>
            Suche
            <input
              name="q"
              defaultValue={q}
              placeholder="Nummer, Titel, Beschlusstext oder Umsetzungsnotiz"
            />
          </label>
          <label>
            Jahr
            <select name="year" defaultValue={yearNum ? String(yearNum) : ""}>
              <option value="">Alle Jahre</option>
              {years.map((row)=>(
                <option key={String(row.year)} value={String(row.year)}>
                  {String(row.year)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">Alle Status</option>
              <option value="open">Offen</option>
              <option value="in_progress">In Umsetzung</option>
              <option value="implemented">Umgesetzt</option>
              <option value="withdrawn">Aufgehoben</option>
              <option value="rejected">Abgelehnt</option>
            </select>
          </label>
          <button className="mini-button">Filtern</button>
          {(q || yearNum || status) && (
            <Link href={view==="active" ? "/beschluesse" : "/beschluesse?view="+view} className="mini-button">Zurücksetzen</Link>
          )}
        </form>
      </details>

      <section className="resolution-register">
        {resolutions.length===0 ? (
          <article className="panel">
            <div className="empty-state">Keine Beschlüsse für diesen Filter gefunden.</div>
          </article>
        ) : resolutions.map((resolution)=>(
          <article
            className={"resolution-card "+(resolution.task_overdue ? "is-overdue" : "")}
            key={String(resolution.id)}
          >
            <div className="resolution-card-number">
              <span>Beschluss</span>
              <strong>
                {resolution.resolution_number ? String(resolution.resolution_number) : "ohne Nr."}
              </strong>
              <small>{formatDate(resolution.decided_at)}</small>
            </div>

            <div className="resolution-card-body">
              <div className="resolution-card-head">
                <div>
                  <h2>{String(resolution.title)}</h2>
                  {resolution.meeting_id && (
                    meetingResolutionHref(resolution) ? (
                      <Link href={meetingResolutionHref(resolution) as string}>
                        {String(resolution.meeting_title)}
                        {resolution.agenda_position ? " · TOP "+String(resolution.agenda_position) : ""}
                      </Link>
                    ) : (
                      <span className="muted-copy">
                        {String(resolution.meeting_title)}
                        {resolution.agenda_position ? " · TOP "+String(resolution.agenda_position) : ""}
                        {" · Historischer Beschluss"}
                      </span>
                    )
                  )}
                </div>
                <div className="resolution-head-status">
                  {resolution.task_overdue && <span className="resolution-overdue-chip">Überfällig</span>}
                  <b className={"resolution-status resolution-status-"+(resolution.decision_outcome==="rejected" ? "rejected" : String(resolution.status))}>
                    {resolution.decision_outcome==="rejected"
                      ? "Abgelehnt"
                      : statusLabels[String(resolution.status)] ?? String(resolution.status)}
                  </b>
                </div>
              </div>

              <p className="resolution-text">{String(resolution.decision_text)}</p>

              <details className="resolution-details-drawer">
                <summary>
                  <div>
                    <strong>Beschlussdetails</strong>
                    <span>Abstimmung, Stimmen & Umsetzungsnotiz</span>
                  </div>
                  <b>+</b>
                </summary>
                <div className="resolution-details-body">
                  <div className="resolution-meta-grid">
                    <div><span>Ergebnis</span><strong>{resolution.decision_outcome==="accepted" ? "Angenommen" : resolution.decision_outcome==="rejected" ? "Abgelehnt" : "–"}</strong></div>
                    <div><span>Stimmberechtigt</span><strong>{Number(resolution.eligible_voters ?? 0)}</strong></div>
                    <div><span>Ausgeschlossen</span><strong>{Number(resolution.excluded_voters ?? 0)}</strong></div>
                    <div><span>Ja</span><strong>{Number(resolution.votes_yes)}</strong></div>
                    <div><span>Nein</span><strong>{Number(resolution.votes_no)}</strong></div>
                    <div><span>Enthaltung</span><strong>{Number(resolution.votes_abstain)}</strong></div>
                    <div><span>Abstimmungsart</span><strong>{voteMethodLabels[String(resolution.vote_method)] ?? "–"}</strong></div>
                    <div>
                      <span>Umgesetzt am</span>
                      <strong>{resolution.implemented_at ? formatDate(resolution.implemented_at) : "–"}</strong>
                    </div>
                  </div>

                  {resolution.vote_details && (
                    <div className="resolution-implementation-note">
                      <span className="eyebrow">Namentliche Abstimmung</span>
                      <p>{String(resolution.vote_details)}</p>
                    </div>
                  )}

                  {resolution.implementation_notes && (
                    <div className="resolution-implementation-note">
                      <span className="eyebrow">Umsetzungsnotiz</span>
                      <p>{String(resolution.implementation_notes)}</p>
                    </div>
                  )}
                </div>
              </details>

              {resolution.task_id ? (
                <div className="resolution-task-box">
                  <div>
                    <span className="eyebrow">Folgeaufgabe</span>
                    <strong>{String(resolution.task_title)}</strong>
                    <small>
                      {resolution.owner_first_name
                        ? String(resolution.owner_first_name)+" "+String(resolution.owner_last_name)
                        : "Nicht zugewiesen"}
                      {resolution.task_due_date
                        ? " · Frist "+formatDate(resolution.task_due_date)
                        : ""}
                    </small>
                  </div>
                  <div className="resolution-task-actions">
                    <b className={"status-badge status-"+String(resolution.task_status)}>
                      {taskStatusLabel(resolution.task_status)}
                    </b>
                    <Link
                      href={resolution.task_overdue ? "/aufgaben?view=overdue" : "/aufgaben"}
                      className="mini-button"
                    >
                      {resolution.task_overdue ? "Überfällige Aufgabe öffnen" : "Aufgaben öffnen"}
                    </Link>
                  </div>
                </div>
              ) : canCreateTasks && resolution.decision_outcome!=="rejected" && !["implemented","withdrawn"].includes(String(resolution.status)) ? (
                <details className="resolution-task-create">
                  <summary>Folgeaufgabe anlegen</summary>
                  <form action={createResolutionTaskAction} className="form-stack">
                    <input type="hidden" name="resolutionId" value={String(resolution.id)} />
                    <input type="hidden" name="sourceSystem" value={String(resolution.source_system)} />
                    <label>
                      Titel
                      <input
                        name="title"
                        defaultValue={"Beschluss umsetzen: "+String(resolution.title)}
                        required
                      />
                    </label>
                    <label>
                      Beschreibung
                      <textarea
                        name="description"
                        rows={3}
                        defaultValue={String(resolution.decision_text)}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Verantwortlich
                        <select name="ownerMemberId" defaultValue="">
                          <option value="">Noch offen</option>
                          {members.map((member)=>(
                            <option key={String(member.id)} value={String(member.id)}>
                              {String(member.first_name)} {String(member.last_name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Frist<input name="dueDate" type="date" /></label>
                    </div>
                    <button className="primary-button">Aufgabe anlegen</button>
                  </form>
                </details>
              ) : null}

              {canWrite && resolution.decision_outcome!=="rejected" && (
                <details className="resolution-implementation-edit">
                  <summary>Umsetzungsnotiz bearbeiten</summary>
                  <form action={updateResolutionImplementationAction} className="form-stack">
                    <input type="hidden" name="id" value={String(resolution.id)} />
                    <input type="hidden" name="sourceSystem" value={String(resolution.source_system)} />
                    <label>
                      Notiz
                      <textarea
                        name="implementationNotes"
                        rows={3}
                        defaultValue={
                          resolution.implementation_notes
                            ? String(resolution.implementation_notes)
                            : ""
                        }
                        placeholder="Was wurde umgesetzt, wann und mit welchem Ergebnis?"
                      />
                    </label>
                    <button className="mini-button">Notiz speichern</button>
                  </form>
                </details>
              )}

              {canWrite && resolution.decision_outcome!=="rejected" && resolution.status!=="withdrawn" && (
                <div className="resolution-workflow-actions">
                  {resolution.status==="open" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                    <input type="hidden" name="sourceSystem" value={String(resolution.source_system)} />
                      <input type="hidden" name="status" value="in_progress" />
                      <button className="primary-button">Umsetzung starten</button>
                    </form>
                  )}

                  {resolution.status==="in_progress" && (
                    <form action={updateResolutionStatusAction}>
                      <input type="hidden" name="id" value={String(resolution.id)} />
                    <input type="hidden" name="sourceSystem" value={String(resolution.source_system)} />
                      <input type="hidden" name="status" value="implemented" />
                      <ConfirmSubmitButton
                        message="Beschluss als vollständig umgesetzt markieren? Eine verknüpfte Folgeaufgabe wird ebenfalls erledigt."
                        className="primary-button"
                      >
                        Als umgesetzt markieren
                      </ConfirmSubmitButton>
                    </form>
                  )}

                  {resolution.status==="implemented" && (
                    <span className="resolution-workflow-complete">✓ Umsetzung abgeschlossen</span>
                  )}

                  <details className="resolution-more-actions">
                    <summary>Weitere Aktionen</summary>
                    <div>
                      {resolution.status!=="open" && (
                        <form action={updateResolutionStatusAction}>
                          <input type="hidden" name="id" value={String(resolution.id)} />
                    <input type="hidden" name="sourceSystem" value={String(resolution.source_system)} />
                          <input type="hidden" name="status" value="open" />
                          <button className="mini-button">Wieder öffnen</button>
                        </form>
                      )}
                      <form action={updateResolutionStatusAction}>
                        <input type="hidden" name="id" value={String(resolution.id)} />
                    <input type="hidden" name="sourceSystem" value={String(resolution.source_system)} />
                        <input type="hidden" name="status" value="withdrawn" />
                        <ConfirmSubmitButton
                          message={
                            "Beschluss „"+
                            String(resolution.resolution_number ?? resolution.title)+
                            "“ wirklich aufheben? Eine offene Folgeaufgabe wird abgebrochen."
                          }
                        >
                          Aufheben
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
