"use client";

import { useEffect,useMemo,useRef,useState } from "react";
import { saveMeetingV3NoteAction } from "@/app/sitzungen-neu/live-actions";

type LocalDraft={
  content:string;
  baseVersion:number;
  savedAt:string;
};

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
  const storageKey=useMemo(
    ()=>`vdc:meeting-v3:note:${meetingId}:${agendaItemId}`,
    [meetingId,agendaItemId],
  );
  const [content,setContent]=useState(initialContent);
  const [status,setStatus]=useState(initialVersion>0 ? `Gespeichert · v${initialVersion}` : "Autosave aktiv");
  const [saving,setSaving]=useState(false);
  const lastSaved=useRef(initialContent);
  const currentContent=useRef(initialContent);
  const serverVersion=useRef(initialVersion);
  const restoredLocalDraft=useRef(false);

  useEffect(()=>{
    if(restoredLocalDraft.current) return;
    restoredLocalDraft.current=true;

    try{
      const raw=window.localStorage.getItem(storageKey);
      if(!raw) return;
      const draft=JSON.parse(raw) as Partial<LocalDraft>;
      if(
        typeof draft.content==="string" &&
        typeof draft.baseVersion==="number" &&
        draft.baseVersion>=initialVersion &&
        draft.content!==initialContent
      ){
        currentContent.current=draft.content;
        setContent(draft.content);
        setStatus("Lokaler Zwischenstand wiederhergestellt");
      }else if(draft.baseVersion<initialVersion || draft.content===initialContent){
        window.localStorage.removeItem(storageKey);
      }
    }catch{
      window.localStorage.removeItem(storageKey);
    }
  },[initialContent,initialVersion,storageKey]);

  useEffect(()=>{
    currentContent.current=content;
    if(content===lastSaved.current){
      try{window.localStorage.removeItem(storageKey);}catch{}
      return;
    }

    try{
      const draft:LocalDraft={
        content,
        baseVersion:serverVersion.current,
        savedAt:new Date().toISOString(),
      };
      window.localStorage.setItem(storageKey,JSON.stringify(draft));
    }catch{}

    setStatus(navigator.onLine ? "Ungespeicherte Änderungen" : "Offline · lokal gesichert");

    const timer=window.setTimeout(async ()=>{
      const snapshot=currentContent.current;
      setSaving(true);
      try{
        const result=await saveMeetingV3NoteAction(meetingId,agendaItemId,snapshot,"autosave");
        if(result.ok){
          serverVersion.current=Number(result.version);
          lastSaved.current=snapshot;
          if(currentContent.current===snapshot){
            try{window.localStorage.removeItem(storageKey);}catch{}
            setStatus(`Gespeichert · v${result.version}`);
          }else{
            try{
              const draft:LocalDraft={
                content:currentContent.current,
                baseVersion:serverVersion.current,
                savedAt:new Date().toISOString(),
              };
              window.localStorage.setItem(storageKey,JSON.stringify(draft));
            }catch{}
            setStatus("Neue Änderungen warten auf Autosave");
          }
        }else{
          setStatus("Server nicht erreichbar · lokal gesichert");
        }
      }catch{
        setStatus("Offline · lokal gesichert");
      }finally{
        setSaving(false);
      }
    },1200);

    return ()=>window.clearTimeout(timer);
  },[content,meetingId,agendaItemId,storageKey]);

  useEffect(()=>{
    function handleOnline(){
      if(currentContent.current!==lastSaved.current){
        setStatus("Verbindung wieder da · Autosave wird fortgesetzt");
        setContent((current)=>current+"");
      }
    }
    function handleOffline(){
      if(currentContent.current!==lastSaved.current){
        setStatus("Offline · lokal gesichert");
      }
    }
    window.addEventListener("online",handleOnline);
    window.addEventListener("offline",handleOffline);
    return ()=>{
      window.removeEventListener("online",handleOnline);
      window.removeEventListener("offline",handleOffline);
    };
  },[]);

  async function checkpoint(){
    const snapshot=currentContent.current;
    setSaving(true);
    setStatus("Zwischenstand wird gespeichert …");
    try{
      const result=await saveMeetingV3NoteAction(meetingId,agendaItemId,snapshot,"checkpoint");
      if(result.ok){
        serverVersion.current=Number(result.version);
        lastSaved.current=snapshot;
        if(currentContent.current===snapshot){
          try{window.localStorage.removeItem(storageKey);}catch{}
        }
        setStatus(`Zwischenstand gespeichert · v${result.version}`);
      }else{
        setStatus("Server nicht erreichbar · lokal gesichert");
      }
    }catch{
      setStatus("Offline · lokal gesichert");
    }finally{
      setSaving(false);
    }
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
        <small>Autosave auf dem Server · bei Verbindungsproblemen zusätzlich lokal auf diesem Gerät gesichert.</small>
        <button type="button" className="ghost-button" onClick={checkpoint} disabled={saving}>
          Zwischenstand speichern
        </button>
      </div>
    </div>
  );
}
