"use client";

import { useEffect,useRef,useState } from "react";
import { saveMeetingV3NoteAction } from "@/app/sitzungen-neu/live-actions";

export function MeetingV3LiveNotes({
  meetingId,
  agendaItemId,
  initialContent,
  initialVersion,
}:{
  meetingId:string;
  agendaItemId:string;
  initialContent:string;
  initialVersion:number;
}) {
  const [content,setContent]=useState(initialContent);
  const [status,setStatus]=useState(initialVersion>0 ? `Gespeichert · v${initialVersion}` : "Autosave aktiv");
  const [saving,setSaving]=useState(false);
  const lastSaved=useRef(initialContent);
  const currentContent=useRef(initialContent);

  useEffect(()=>{
    currentContent.current=content;
    if(content===lastSaved.current) return;

    setStatus("Ungespeicherte Änderungen");
    const timer=window.setTimeout(async ()=>{
      const snapshot=currentContent.current;
      setSaving(true);
      const result=await saveMeetingV3NoteAction(meetingId,agendaItemId,snapshot,"autosave");
      if(result.ok){
        lastSaved.current=snapshot;
        if(currentContent.current===snapshot){
          setStatus(`Gespeichert · v${result.version}`);
        }
      }else{
        setStatus("Autosave fehlgeschlagen");
      }
      setSaving(false);
    },1200);

    return ()=>window.clearTimeout(timer);
  },[content,meetingId,agendaItemId]);

  async function checkpoint(){
    const snapshot=currentContent.current;
    setSaving(true);
    setStatus("Zwischenstand wird gespeichert …");
    const result=await saveMeetingV3NoteAction(meetingId,agendaItemId,snapshot,"checkpoint");
    if(result.ok){
      lastSaved.current=snapshot;
      setStatus(`Zwischenstand gespeichert · v${result.version}`);
    }else{
      setStatus("Speichern fehlgeschlagen");
    }
    setSaving(false);
  }

  return (
    <div className="meeting-v3-live-notes">
      <div className="meeting-v3-live-notes-head">
        <div>
          <span className="eyebrow">Protokollnotizen</span>
          <strong>Diskussion, Ergebnis und Hinweise</strong>
        </div>
        <span className={saving ? "meeting-v3-save-state saving" : "meeting-v3-save-state"}>{status}</span>
      </div>
      <textarea
        value={content}
        onChange={(event)=>setContent(event.currentTarget.value)}
        rows={12}
        placeholder="Diskussion, Ergebnis und wichtige Hinweise festhalten …"
        aria-label="Live-Protokollnotizen"
      />
      <div className="meeting-v3-live-notes-footer">
        <small>Änderungen werden nach kurzer Pause automatisch versioniert gespeichert.</small>
        <button type="button" className="ghost-button" onClick={checkpoint} disabled={saving}>
          Zwischenstand speichern
        </button>
      </div>
    </div>
  );
}
