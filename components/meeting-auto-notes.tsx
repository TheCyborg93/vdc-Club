"use client";

import { useEffect, useRef, useState } from "react";
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
  const [state,setState]=useState<"idle"|"dirty"|"saving"|"saved"|"error">("idle");
  const first=useRef(true);
  const latestValue=useRef(initialValue);
  const saveSequence=useRef(0);
  const saveChain=useRef<Promise<void>>(Promise.resolve());

  useEffect(()=>{
    latestValue.current=value;
    if (first.current) {
      first.current=false;
      return;
    }

    setState("dirty");
    const sequence=++saveSequence.current;
    const snapshot=value;

    const timer=window.setTimeout(()=>{
      saveChain.current=saveChain.current.then(async ()=>{
        setState("saving");
        const result=await saveAgendaNotesInlineAction(meetingId,agendaItemId,snapshot);

        if (sequence!==saveSequence.current || snapshot!==latestValue.current) {
          return;
        }
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
        {state==="dirty"
          ? "Änderung wartet …"
          : state==="saving"
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
