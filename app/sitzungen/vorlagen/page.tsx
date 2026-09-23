import Link from "next/link";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import { meetingV3AgendaTypeLabels,meetingV3TypeLabels,type MeetingV3AgendaType,type MeetingV3Type } from "@/lib/meeting-v3";
import {
  addMeetingV3TemplateItemAction,
  createMeetingV3TemplateAction,
  deleteMeetingV3TemplateItemAction,
  setMeetingV3TemplateDefaultAction,
  toggleMeetingV3TemplateActiveAction,
} from "@/app/sitzungen/template-actions";

export const dynamic="force-dynamic";

const errors:Record<string,string>={
  missing:"Bitte alle Pflichtfelder korrekt ausfüllen.",
};

export default async function MeetingTemplatesPage({
  searchParams,
}:{searchParams:Promise<{error?:string;created?:string;saved?:string}>}){
  const actor=await requirePermission("meetings.read");
  const sql=getDb();
  const query=await searchParams;
  const canWrite=hasPermission(actor.roles,"meetings.write");

  const templates=sql ? await sql`
    SELECT
      t.id::text,t.name,t.meeting_type,t.description,t.is_default,t.is_active,
      COALESCE(
        json_agg(
          json_build_object(
            'id',i.id::text,
            'position',i.position,
            'title',i.title,
            'agenda_type',i.agenda_type,
            'description',i.description,
            'estimated_minutes',i.estimated_minutes,
            'is_required',i.is_required
          )
          ORDER BY i.position
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM meeting_v3_templates t
    LEFT JOIN meeting_v3_template_items i ON i.template_id=t.id
    GROUP BY t.id
    ORDER BY t.is_active DESC,t.meeting_type,t.is_default DESC,t.name
  ` : [];

  return (
    <div className="page-stack meeting-v3-page">
      <Link href="/sitzungen" className="back-link">← Zur Sitzungszentrale</Link>

      <section className="meeting-v3-hero">
        <div>
          <span className="eyebrow">Sitzungsvorlagen</span>
          <h1>Vorlagen verwalten</h1>
          <p>Standard-TOPs einmal pflegen und beim Anlegen einer Sitzung direkt übernehmen.</p>
        </div>
      </section>

      {query.error && <p className="form-error">{errors[query.error] ?? "Aktion fehlgeschlagen."}</p>}
      {(query.created || query.saved) && <p className="form-success">Vorlagen wurden aktualisiert.</p>}

      {canWrite && (
        <details className="panel">
          <summary>Neue Vorlage anlegen</summary>
          <form action={createMeetingV3TemplateAction} className="form-grid">
            <label>Name<input name="name" required placeholder="z. B. Vorstand kompakt"/></label>
            <label>Sitzungsart
              <select name="meetingType" defaultValue="board">
                <option value="board">Vorstandssitzung</option>
                <option value="general_assembly">Mitgliederversammlung</option>
                <option value="extraordinary">Außerordentliche Sitzung</option>
                <option value="custom">Freie Sitzung</option>
              </select>
            </label>
            <label className="meeting-v3-wide">Beschreibung<textarea name="description" rows={2}/></label>
            <label className="meeting-v3-checkbox-row">
              <input type="checkbox" name="makeDefault" value="yes"/> Als Standardvorlage verwenden
            </label>
            <div className="meeting-v3-wide"><button className="primary-button" type="submit">Vorlage anlegen</button></div>
          </form>
        </details>
      )}

      <div className="page-stack">
        {templates.map((template)=>{
          const items=Array.isArray(template.items) ? template.items as Record<string,unknown>[] : [];
          const type=String(template.meeting_type) as MeetingV3Type;
          return (
            <section className="panel" key={String(template.id)}>
              <div className="panel-head">
                <div>
                  <span className="eyebrow">{meetingV3TypeLabels[type]}</span>
                  <h2>{String(template.name)}</h2>
                  {Boolean(template.description) && <p>{String(template.description)}</p>}
                </div>
                <div className="meeting-v3-template-badges">
                  {Boolean(template.is_default) && <span className="status-badge">Standard</span>}
                  <span className={Boolean(template.is_active) ? "status-badge" : "status-badge muted"}>{Boolean(template.is_active) ? "Aktiv" : "Inaktiv"}</span>
                </div>
              </div>

              <div className="meeting-v3-agenda-list">
                {items.length===0 && <p className="empty-state">Noch keine TOPs in dieser Vorlage.</p>}
                {items.map((item)=>(
                  <div className="meeting-v3-agenda-item" key={String(item.id)}>
                    <b>{Number(item.position)}</b>
                    <div>
                      <strong>{String(item.title)}</strong>
                      <span>{meetingV3AgendaTypeLabels[String(item.agenda_type) as MeetingV3AgendaType]}</span>
                      {Boolean(item.description) && <small>{String(item.description)}</small>}
                      {Boolean(item.estimated_minutes) && <small>{Number(item.estimated_minutes)} Min.</small>}
                    </div>
                    {canWrite && (
                      <form action={deleteMeetingV3TemplateItemAction}>
                        <input type="hidden" name="templateId" value={String(template.id)}/>
                        <input type="hidden" name="itemId" value={String(item.id)}/>
                        <button className="mini-button" type="submit">Entfernen</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>

              {canWrite && Boolean(template.is_active) && (
                <details className="meeting-v3-add-top">
                  <summary>Vorlagen-TOP hinzufügen</summary>
                  <form action={addMeetingV3TemplateItemAction} className="form-grid">
                    <input type="hidden" name="templateId" value={String(template.id)}/>
                    <label>Titel<input name="title" required/></label>
                    <label>Typ
                      <select name="agendaType" defaultValue="consultation">
                        <option value="information">Information</option>
                        <option value="consultation">Beratung</option>
                        <option value="decision">Beschluss</option>
                      </select>
                    </label>
                    <label>Zeitansatz<input name="estimatedMinutes" type="number" min="1" placeholder="Min."/></label>
                    <label className="meeting-v3-wide">Beschreibung<textarea name="description" rows={2}/></label>
                    <label className="meeting-v3-checkbox-row"><input type="checkbox" name="isRequired" value="yes"/> Pflicht-TOP</label>
                    <div className="meeting-v3-wide"><button className="ghost-button" type="submit">TOP hinzufügen</button></div>
                  </form>
                </details>
              )}

              {canWrite && (
                <div className="meeting-v3-readiness-actions">
                  {!Boolean(template.is_default) && Boolean(template.is_active) && (
                    <form action={setMeetingV3TemplateDefaultAction}>
                      <input type="hidden" name="templateId" value={String(template.id)}/>
                      <button className="ghost-button" type="submit">Als Standard setzen</button>
                    </form>
                  )}
                  <form action={toggleMeetingV3TemplateActiveAction}>
                    <input type="hidden" name="templateId" value={String(template.id)}/>
                    <button className="ghost-button" type="submit">{Boolean(template.is_active) ? "Deaktivieren" : "Aktivieren"}</button>
                  </form>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
