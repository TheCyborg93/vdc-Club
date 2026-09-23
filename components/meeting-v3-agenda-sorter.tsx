"use client";

import { useState,useTransition } from "react";
import { reorderMeetingV3AgendaAction } from "@/app/sitzungen/actions";

type SortItem={
  id:string;
  title:string;
  position:number;
};

export function MeetingV3AgendaSorter({
  meetingId,
  items,
}:{
  meetingId:string;
  items:SortItem[];
}){
  const [ordered,setOrdered]=useState(items);
  const [draggedId,setDraggedId]=useState<string|null>(null);
  const [status,setStatus]=useState("Ziehen zum Sortieren");
  const [pending,startTransition]=useTransition();

  function move(dragId:string,targetId:string){
    if(dragId===targetId) return;
    const next=[...ordered];
    const from=next.findIndex((item)=>item.id===dragId);
    const to=next.findIndex((item)=>item.id===targetId);
    if(from<0 || to<0) return;
    const [dragged]=next.splice(from,1);
    next.splice(to,0,dragged);
    const normalized=next.map((item,index)=>({...item,position:index+1}));
    setOrdered(normalized);
    setStatus("Reihenfolge wird gespeichert ...");
    startTransition(async ()=>{
      const result=await reorderMeetingV3AgendaAction(
        meetingId,
        normalized.map((item)=>item.id),
      );
      setStatus(result.ok ? "Reihenfolge gespeichert" : "Speichern fehlgeschlagen - Seite neu laden");
    });
  }

  return (
    <div className="meeting-v3-agenda-sorter" aria-label="TOPs per Drag and Drop sortieren">
      <div className="meeting-v3-agenda-sorter-head">
        <strong>Reihenfolge</strong>
        <span>{pending ? "Speichert ..." : status}</span>
      </div>
      <div className="meeting-v3-agenda-sorter-list">
        {ordered.map((item)=>(
          <div
            key={item.id}
            className={"meeting-v3-agenda-sort-row "+(draggedId===item.id ? "is-dragging" : "")}
            draggable={!pending}
            onDragStart={()=>setDraggedId(item.id)}
            onDragEnd={()=>setDraggedId(null)}
            onDragOver={(event)=>event.preventDefault()}
            onDrop={(event)=>{
              event.preventDefault();
              if(draggedId) move(draggedId,item.id);
              setDraggedId(null);
            }}
          >
            <span aria-hidden="true">☰</span>
            <b>{item.position}</b>
            <strong>{item.title}</strong>
          </div>
        ))}
      </div>
      <small>Desktop: TOP ziehen und ablegen. Auf Handy bleiben die Pfeiltasten an den TOPs verfügbar.</small>
    </div>
  );
}
