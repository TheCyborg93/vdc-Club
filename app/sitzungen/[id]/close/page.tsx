import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  createMeetingV3MinutesDraftAction,
  returnMeetingV3ToLiveAction,
} from "@/app/sitzungen/closing-actions";

export const dynamic="force-dynamic";

const errors:Record<string,string>={
  locked:"Die Sitzung ist nicht mehr im Abschluss.",
  not_ready:"Es sind noch offene oder laufende TOPs vorhanden.",
  minutes:"Der Protokollentwurf konnte nicht erzeugt werden.",
};

function formatDateTime(value:unknown){
  if(!value) return "–";
  const date=new Date(String(value));
  if(Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE",{
    weekday:"short",day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",timeZone:"Europe/Berlin",
  }).format(date);
}

export default async function MeetingV3ClosePage({
  params,
  searchParams,
}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{error?:string}>;
}){
  const actor=await requirePermission("meetings.read");
  const {id}=await params;
  const query=await searchParams;
  const sql=getDb();
  if(!sql) notFound();

  const [rows,deferred]=await Promise.all([
    sql`
      SELECT
        m.id::text,m.title,m.lifecycle_state,m.opened_at,m.ended_at,m.next_meeting_at,
        m.quorum_confirmed,m.quorum_basis,m.quorum_note,
        (SELECT count(*)::int FROM meeting_v3_participants p WHERE p.meeting_id=m.id AND p.attendance='present') AS present_count,
        (SELECT count(*)::int FROM meeting_v3_participants p WHERE p.meeting_id=m.id AND p.attendance='present' AND p.voting_eligible=true) AS eligible_count,
        (SELECT count(*)::int FROM meeting_v3_agenda_items ai WHERE ai.meeting_id=m.id) AS agenda_count,
        (SELECT count(*)::int FROM meeting_v3_agenda_items ai WHERE ai.meeting_id=m.id AND ai.status='completed') AS completed_count,
        (SELECT count(*)::int FROM meeting_v3_agenda_items ai WHERE ai.meeting_id=m.id AND ai.status='deferred') AS deferred_count,
        (SELECT count(*)::int FROM meeting_v3_agenda_items ai WHERE ai.meeting_id=m.id AND ai.status IN ('open','active')) AS unfinished_count,
        (SELECT count(*)::int FROM meeting_v3_resolutions r WHERE r.meeting_id=m.id) AS resolution_count,
        (SELECT count(*)::int FROM tasks t WHERE t.source_type='meeting_v3_resolution' AND t.source_id IN (
          SELECT r.id FROM meeting_v3_resolutions r WHERE r.meeting_id=m.id
        ) AND t.status<>'cancelled') AS task_count
      FROM meeting_v3_meetings m
      WHERE m.id=${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT ai.id::text,ai.position,ai.title,ai.description,ai.spontaneous,ai.spontaneous_reason
      FROM meeting_v3_agenda_items ai
      WHERE ai.meeting_id=${id}::uuid AND ai.status='deferred'
      ORDER BY ai.position
    `,
  ]);

  const meeting=rows[0];
  if(!meeting) notFound();

  const state=String(meeting.lifecycle_state);
  if(state==="live") redirect(`/sitzungen/${id}/live`);
  if(["minutes_draft","minutes_review","archived"].includes(state)) redirect(`/sitzungen/${id}/minutes`);
  if(state!=="closing") redirect(`/sitzungen/${id}`);

  const canWrite=hasPermission(actor.roles,"meetings.write");
  const unfinished=Number(meeting.unfinished_count ?? 0);
  const ready=unfinished===0;

  return (
    <div className="page-stack meeting-v3-page meeting-v3-close-page">
      <section className="meeting-v3-hero meeting-v3-close-hero">
        <div>
          <span className="eyebrow">Sitzungsabschluss</span>
          <h1>{String(meeting.title)}</h1>
          <p>Beginn {formatDateTime(meeting.opened_at)} · Ende {formatDateTime(meeting.ended_at)}</p>
        </div>
        <span className="meeting-v3-state closing">Abschluss</span>
      </section>

      {query.error && <p className="form-error">{errors[query.error] ?? "Der Abschluss konnte nicht verarbeitet werden."}</p>}

      <section className="meeting-v3-close-checks">
        <article className={ready ? "complete" : ""}>
          <span>Tagesordnung</span>
          <strong>{Number(meeting.agenda_count ?? 0)-unfinished}/{Number(meeting.agenda_count ?? 0)}</strong>
          <small>{ready ? "Kein TOP mehr offen" : `${unfinished} TOP(s) noch offen`}</small>
        </article>
        <article className={meeting.quorum_confirmed===true ? "complete" : ""}>
          <span>Beschlussfähigkeit</span>
          <strong>{meeting.quorum_confirmed===true ? "Ja" : meeting.quorum_confirmed===false ? "Nein" : "Offen"}</strong>
          <small>{String(meeting.quorum_basis ?? "Keine Grundlage ergänzt")}</small>
        </article>
        <article>
          <span>Beschlüsse</span>
          <strong>{Number(meeting.resolution_count ?? 0)}</strong>
          <small>{Number(meeting.task_count ?? 0)} Folgeaufgabe(n)</small>
        </article>
        <article>
          <span>Vertagt</span>
          <strong>{Number(meeting.deferred_count ?? 0)}</strong>
          <small>für nächste Sitzung vormerken</small>
        </article>
      </section>

      {deferred.length>0 && (
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Übernahme</span><h2>Vertagte TOPs</h2></div>
            <span className="count-chip">{deferred.length}</span>
          </div>
          <div className="meeting-v3-close-deferred">
            {deferred.map((item)=>(
              <article key={String(item.id)}>
                <b>TOP {Number(item.position)}</b>
                <div>
                  <strong>{String(item.title)}</strong>
                  {item.description && <p>{String(item.description)}</p>}
                  {item.spontaneous && <small>Spontan ergänzt · {String(item.spontaneous_reason ?? "")}</small>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="meeting-v3-work-grid">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Zusammenfassung</span><h2>Sitzungsstand</h2></div></div>
          <div className="meeting-v3-close-summary">
            <div><span>Anwesend</span><strong>{Number(meeting.present_count ?? 0)}</strong></div>
            <div><span>Stimmberechtigt</span><strong>{Number(meeting.eligible_count ?? 0)}</strong></div>
            <div><span>Erledigte TOPs</span><strong>{Number(meeting.completed_count ?? 0)}</strong></div>
            <div><span>Vertagte TOPs</span><strong>{Number(meeting.deferred_count ?? 0)}</strong></div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">Nächste Sitzung</span><h2>Optional vormerken</h2></div></div>
          <p className="muted-copy">Der Termin wird im Protokollentwurf hinterlegt. Vertagte TOPs bleiben sichtbar und können später gezielt übernommen werden.</p>
        </article>
      </section>

      {canWrite && (
        <section className={ready ? "meeting-v3-close-final complete" : "meeting-v3-close-final"}>
          <div>
            <span className="eyebrow">Protokoll</span>
            <h2>{ready ? "Protokollentwurf erzeugen" : "Abschluss noch nicht möglich"}</h2>
            <p>
              {ready
                ? "Die komplette Sitzungsakte wird jetzt als versionierter Snapshot eingefroren und ein Protokollentwurf erzeugt."
                : "Kehre in die Live-Sitzung zurück und bearbeite zuerst alle offenen TOPs."}
            </p>
          </div>

          <div className="meeting-v3-close-final-actions">
            <form action={returnMeetingV3ToLiveAction}>
              <input type="hidden" name="meetingId" value={id}/>
              <button className="ghost-button" type="submit">Zurück zur Live-Sitzung</button>
            </form>

            <form action={createMeetingV3MinutesDraftAction} className="meeting-v3-close-create">
              <input type="hidden" name="meetingId" value={id}/>
              <label>Nächster Termin
                <input name="nextMeetingAt" type="datetime-local"/>
              </label>
              <button className="primary-button" type="submit" disabled={!ready}>Protokollentwurf erzeugen</button>
            </form>
          </div>
        </section>
      )}

      <Link href={`/sitzungen/${id}`} className="back-link">Sitzungsakte öffnen</Link>
    </div>
  );
}
