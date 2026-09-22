"use client";

import { useState, useTransition } from "react";
import {
  deleteAgendaItemAction,
  reorderAgendaItemsAction,
  updateAgendaPreparationAction,
} from "@/app/sitzungen/actions";

type AgendaRow=Record<string,any>;

const typeLabels:Record<string,string>={
  information:"Information",
  consultation:"Beratung",
  decision:"Beschluss",
};

export function MeetingAgendaPlanner({
  meetingId,
  initialItems,
  canWrite,
}:{
  meetingId:string;
  initialItems:AgendaRow[];
  canWrite:boolean;
}) {
  const [items,setItems]=useState(initialItems);
  const [draggedId,setDraggedId]=useState<string|null>(null);
  const [saving,startTransition]=useTransition();
  const [message,setMessage]=useState("");

  function persist(next:AgendaRow[]) {
    setItems(next);
    setMessage("Reihenfolge wird gespeichert …");
    startTransition(async ()=>{
      const result=await reorderAgendaItemsAction(
        meetingId,
        next.map((item)=>String(item.id)),
      );
      setMessage(result.ok ? "✓ Reihenfolge gespeichert" : "Speichern fehlgeschlagen");
    });
  }

  function move(id:string,direction:-1|1) {
    const index=items.findIndex((item)=>String(item.id)===id);
    const target=index+direction;
    if (index<0 || target<0 || target>=items.length) return;
    const next=[...items];
    [next[index],next[target]]=[next[target],next[index]];
    persist(next);
  }

  function dropOn(targetId:string) {
    if (!draggedId || draggedId===targetId) {
      setDraggedId(null);
      return;
    }
    const from=items.findIndex((item)=>String(item.id)===draggedId);
    const to=items.findIndex((item)=>String(item.id)===targetId);
    if (from<0 || to<0) return;
    const next=[...items];
    const [moved]=next.splice(from,1);
    next.splice(to,0,moved);
    setDraggedId(null);
    persist(next);
  }

  if (!items.length) {
    return <div className="empty-state">Noch keine Tagesordnungspunkte angelegt.</div>;
  }

  return (
    <div className="meeting-agenda-planner">
      <div className="meeting-agenda-plan-list">
        {items.map((item,index)=>{
          const id=String(item.id);
          return (
            <article
              key={id}
              draggable={canWrite}
              onDragStart={()=>setDraggedId(id)}
              onDragEnd={()=>setDraggedId(null)}
              onDragOver={(event)=>event.preventDefault()}
              onDrop={()=>dropOn(id)}
              className={draggedId===id ? "is-dragging" : ""}
            >
              <div className="agenda-drag-handle" aria-hidden="true">⋮⋮</div>
              <div className="agenda-plan-number">{String(index+1).padStart(2,"0")}</div>
              <div className="agenda-plan-main">
                <div>
                  <strong>{String(item.title)}</strong>
                  <span className={"agenda-type-chip agenda-type-"+String(item.agenda_type ?? "consultation")}>
                    {typeLabels[String(item.agenda_type)] ?? "Beratung"}
                  </span>
                  {!item.announced_with_invitation && <span className="agenda-late-chip">nachträglich</span>}
                </div>
                {item.description && <p>{String(item.description)}</p>}
              </div>

              {canWrite && (
                <div className="agenda-plan-actions">
                  <button type="button" onClick={()=>move(id,-1)} disabled={index===0 || saving} aria-label="TOP nach oben">↑</button>
                  <button type="button" onClick={()=>move(id,1)} disabled={index===items.length-1 || saving} aria-label="TOP nach unten">↓</button>
                  <details>
                    <summary>Bearbeiten</summary>
                    <div className="agenda-plan-editor">
                      <form action={updateAgendaPreparationAction}>
                        <input type="hidden" name="meetingId" value={meetingId} />
                        <input type="hidden" name="agendaItemId" value={id} />
                        <label>
                          Titel
                          <input name="title" defaultValue={String(item.title)} required />
                        </label>
                        <label>
                          Typ
                          <select name="agendaType" defaultValue={String(item.agenda_type ?? "consultation")}>
                            <option value="information">Information</option>
                            <option value="consultation">Beratung</option>
                            <option value="decision">Beschluss</option>
                          </select>
                        </label>
                        <label>
                          Sachverhalt / Vorbereitung
                          <textarea name="description" rows={3} defaultValue={String(item.description ?? "")} />
                        </label>
                        <button className="mini-button">Änderungen speichern</button>
                      </form>

                      {!item.resolution_id && (
                        <form
                          action={deleteAgendaItemAction}
                          onSubmit={(event)=>{
                            if (!window.confirm("Diesen TOP wirklich löschen?")) event.preventDefault();
                          }}
                        >
                          <input type="hidden" name="meetingId" value={meetingId} />
                          <input type="hidden" name="agendaItemId" value={id} />
                          <button className="meeting-agenda-delete">TOP löschen</button>
                        </form>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="agenda-order-status">
        {saving ? "Reihenfolge wird gespeichert …" : message || "Ziehen oder mit ↑ ↓ sortieren"}
      </div>
    </div>
  );
}
