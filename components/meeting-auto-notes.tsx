"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveAgendaNotesInlineAction } from "@/app/sitzungen/actions";

export function MeetingAutoNotes({
  meetingId,
  agendaItemId,
  initialValue,
}: {
  meetingId:string;
  agendaItemId:string;
  initialValue:string;
}) {
  const [value,setValue]=useState(initialValue);
  const [state,setState]=useState<"idle"|"dirty"|"saved"|"error">("idle");
  const [pending,startTransition]=useTransition();
  const first=useRef(true);

  useEffect(()=>{
    if (first.current) {
      first.current=false;
      return;
    }

    setState("dirty");
    const timer=window.setTimeout(()=>{
      startTransition(async ()=>{
        const result=await saveAgendaNotesInlineAction(meetingId,agendaItemId,value);
        setState(result.ok ? "saved" : "error");
      });
    },800);

    return ()=>window.clearTimeout(timer);
  },[value,meetingId,agendaItemId]);

  const templates=[
    ["Zur Kenntnis genommen","Der Tagesordnungspunkt wurde zur Kenntnis genommen."],
    ["Erledigt","Der Tagesordnungspunkt wurde abschließend behandelt."],
    ["Vertagt","Der Tagesordnungspunkt wurde vertagt und wird in einer kommenden Vorstandssitzung erneut behandelt."],
    ["Keine Entscheidung","Der Tagesordnungspunkt wurde beraten. Es wurde keine Entscheidung getroffen."],
  ];

  return (
    <div className="meeting-autosave-notes">
      <div className="meeting-note-templates">
        {templates.map(([label,text])=>(
          <button
            type="button"
            key={label}
            onClick={()=>setValue(text)}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        name="notes"
        rows={6}
        value={value}
        onChange={(event)=>setValue(event.target.value)}
        placeholder="Diskussion, Ergebnis und wichtige Hinweise festhalten …"
      />
      <div className={"meeting-autosave-state state-"+state}>
        {pending || state==="dirty"
          ? "Speichert …"
          : state==="saved"
            ? "✓ Gespeichert"
            : state==="error"
              ? "Speichern fehlgeschlagen"
              : "Automatisches Speichern aktiv"}
      </div>
    </div>
  );
}
