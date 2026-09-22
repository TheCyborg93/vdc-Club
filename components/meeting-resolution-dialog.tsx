"use client";

import { useEffect, useRef, useState } from "react";
import { createResolutionFromAgendaAction } from "@/app/sitzungen/actions";

type Member=Record<string,any>;

export function MeetingResolutionDialog({
  meetingId,
  agendaItemId,
  agendaPosition,
  title,
  eligibleVoters,
  presentVoterCount,
  excludedCount,
  members,
  canCreateTasks,
}:{
  meetingId:string;
  agendaItemId:string;
  agendaPosition:number;
  title:string;
  eligibleVoters:number;
  presentVoterCount:number;
  excludedCount:number;
  members:Member[];
  canCreateTasks:boolean;
}) {
  const [open,setOpen]=useState(false);
  const [voteMethod,setVoteMethod]=useState("show_of_hands");
  const [outcome,setOutcome]=useState("");
  const [yes,setYes]=useState(0);
  const [no,setNo]=useState(0);
  const [abstain,setAbstain]=useState(0);
  const [createTask,setCreateTask]=useState(false);
  const dialogRef=useRef<HTMLElement|null>(null);

  useEffect(()=>{
    if (!open) return;

    const previous=document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";

    const dialog=dialogRef.current;
    const focusable=()=>Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      ) ?? [],
    );

    window.setTimeout(()=>{
      focusable()[0]?.focus();
    },0);

    function onKeyDown(event:KeyboardEvent) {
      if (event.key==="Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key!=="Tab") return;

      const elements=focusable();
      if (elements.length===0) return;
      const first=elements[0];
      const last=elements[elements.length-1];
      const active=document.activeElement;

      if (event.shiftKey && active===first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active===last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown",onKeyDown);
    return ()=>{
      document.removeEventListener("keydown",onKeyDown);
      document.body.style.overflow=previousOverflow;
      previous?.focus();
    };
  },[open]);

  const total=yes+no+abstain;
  const validTotal=total===eligibleVoters;

  return (
    <>
      <button type="button" className="meeting-action danger" onClick={()=>setOpen(true)}>
        Beschluss
      </button>

      {open && (
        <div className="meeting-modal-backdrop" role="presentation" onMouseDown={()=>setOpen(false)}>
          <section
            ref={dialogRef}
            className="meeting-resolution-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-resolution-title"
            onMouseDown={(event)=>event.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">TOP {agendaPosition}</span>
                <h2 id="meeting-resolution-title">Beschluss erfassen</h2>
                <p>{title}</p>
              </div>
              <button type="button" className="meeting-modal-close" onClick={()=>setOpen(false)} aria-label="Schließen">×</button>
            </header>

            <form action={createResolutionFromAgendaAction} className="meeting-resolution-modal-form">
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="agendaItemId" value={agendaItemId} />

              <label>
                Titel
                <input name="title" defaultValue={title} required />
              </label>

              <label>
                Exakter Beschlusstext
                <textarea name="decisionText" rows={4} required placeholder="Der Vorstand beschließt …" />
              </label>

              <div className="form-grid">
                <label>
                  Abstimmungsart
                  <select name="voteMethod" value={voteMethod} onChange={(event)=>setVoteMethod(event.target.value)}>
                    <option value="show_of_hands">Handzeichen</option>
                    <option value="open">Offen</option>
                    <option value="roll_call">Namentlich</option>
                    <option value="secret">Geheim</option>
                    <option value="electronic">Elektronisch</option>
                  </select>
                </label>
                <label>
                  Ergebnis
                  <select name="decisionOutcome" value={outcome} onChange={(event)=>setOutcome(event.target.value)} required>
                    <option value="">Bitte auswählen</option>
                    <option value="accepted">Angenommen</option>
                    <option value="rejected">Abgelehnt</option>
                  </select>
                </label>
              </div>

              {voteMethod==="roll_call" && (
                <label>
                  Namentliche Stimmen
                  <textarea
                    name="voteDetails"
                    rows={3}
                    required
                    placeholder="Max Mustermann: Ja · Erika Beispiel: Enthaltung"
                  />
                </label>
              )}

              <section className="meeting-vote-box">
                <div className="meeting-vote-context">
                  <div><span>Anwesend stimmberechtigt</span><strong>{presentVoterCount}</strong></div>
                  <div><span>Ausgeschlossen</span><strong>{excludedCount}</strong></div>
                  <div>
                    <span>Für diesen TOP</span>
                    <input
                      name="eligibleVoters"
                      type="number"
                      min="0"
                      value={eligibleVoters}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>

                <div className="vote-input-grid">
                  <label>Ja<input name="votesYes" type="number" min="0" value={yes} onChange={(event)=>setYes(Math.max(0,Number(event.target.value)||0))} /></label>
                  <label>Nein<input name="votesNo" type="number" min="0" value={no} onChange={(event)=>setNo(Math.max(0,Number(event.target.value)||0))} /></label>
                  <label>Enthaltung<input name="votesAbstain" type="number" min="0" value={abstain} onChange={(event)=>setAbstain(Math.max(0,Number(event.target.value)||0))} /></label>
                </div>

                <div className={validTotal ? "meeting-vote-check is-valid" : "meeting-vote-check is-invalid"}>
                  <strong>{yes} + {no} + {abstain} = {total}</strong>
                  <span>{validTotal ? "✓ passt zu "+eligibleVoters+" Stimmberechtigten" : "Stimmen müssen zusammen "+eligibleVoters+" ergeben"}</span>
                </div>
              </section>

              {canCreateTasks && outcome==="accepted" && (
                <section className="meeting-resolution-task">
                  <label className="checkbox-row">
                    <input type="checkbox" name="createTask" checked={createTask} onChange={(event)=>setCreateTask(event.target.checked)} />
                    <span>Folgeaufgabe daraus erstellen</span>
                  </label>
                  {createTask && (
                    <div className="form-grid">
                      <label>
                        Verantwortlich
                        <select name="taskOwner" defaultValue="">
                          <option value="">Noch offen</option>
                          {members.map((member)=>(
                            <option key={String(member.id)} value={String(member.id)}>
                              {String(member.first_name)} {String(member.last_name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Frist<input name="taskDueDate" type="date" /></label>
                    </div>
                  )}
                </section>
              )}

              <footer>
                <button type="button" className="ghost-button" onClick={()=>setOpen(false)}>Abbrechen</button>
                <button className="primary-button" type="submit" disabled={!validTotal || !outcome}>
                  Beschluss speichern
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
