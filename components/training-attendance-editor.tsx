"use client";

import { useMemo, useState } from "react";
import { saveTrainingAttendanceAction } from "@/app/training/actions";

type Attendance = "present" | "absent" | "excused";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  attendance: Attendance;
};

export function TrainingAttendanceEditor({
  sessionId,
  members,
  editable,
  initialNote,
}: {
  sessionId: string;
  members: Member[];
  editable: boolean;
  initialNote: string;
}) {
  const [attendance, setAttendance] = useState<Record<string, Attendance>>(
    Object.fromEntries(members.map((member) => [member.id, member.attendance])),
  );

  const counts = useMemo(() => {
    const values=Object.values(attendance);
    return {
      present:values.filter((value)=>value==="present").length,
      absent:values.filter((value)=>value==="absent").length,
      excused:values.filter((value)=>value==="excused").length,
    };
  },[attendance]);

  function setAll(next: Attendance) {
    if (!editable) return;
    setAttendance(Object.fromEntries(members.map((member)=>[member.id,next])));
  }

  return (
    <form action={saveTrainingAttendanceAction} className="training-fast-form">
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="training-fast-toolbar">
        <div>
          <span>Anwesend</span><strong>{counts.present}</strong>
        </div>
        <div>
          <span>Nicht da</span><strong>{counts.absent}</strong>
        </div>
        <div>
          <span>Entschuldigt</span><strong>{counts.excused}</strong>
        </div>

        {editable && (
          <div className="training-bulk-actions">
            <button type="button" onClick={()=>setAll("present")}>Alle anwesend</button>
            <button type="button" onClick={()=>setAll("absent")}>Alle nicht da</button>
            <button type="button" onClick={()=>setAll("excused")}>Alle entschuldigt</button>
          </div>
        )}
      </div>

      <div className="training-fast-list">
        {members.map((member)=>(
          <div className="training-fast-row" key={member.id}>
            <div className="member-avatar">
              {member.firstName.slice(0,1)}{member.lastName.slice(0,1)}
            </div>
            <div className="training-fast-member">
              <strong>{member.firstName} {member.lastName}</strong>
              <span>{member.status==="passive" ? "Passives Mitglied" : "Aktives Mitglied"}</span>
            </div>

            <input
              type="hidden"
              name={`attendance_${member.id}`}
              value={attendance[member.id] ?? "absent"}
            />

            <div className="training-state-buttons" role="group" aria-label={`Anwesenheit ${member.firstName} ${member.lastName}`}>
              <button
                type="button"
                disabled={!editable}
                className={attendance[member.id]==="present" ? "is-active state-present" : ""}
                onClick={()=>setAttendance((current)=>({...current,[member.id]:"present"}))}
              >
                Anwesend
              </button>
              <button
                type="button"
                disabled={!editable}
                className={attendance[member.id]==="excused" ? "is-active state-excused" : ""}
                onClick={()=>setAttendance((current)=>({...current,[member.id]:"excused"}))}
              >
                Entschuldigt
              </button>
              <button
                type="button"
                disabled={!editable}
                className={attendance[member.id]==="absent" ? "is-active state-absent" : ""}
                onClick={()=>setAttendance((current)=>({...current,[member.id]:"absent"}))}
              >
                Nicht da
              </button>
            </div>
          </div>
        ))}
      </div>

      <label className="training-note-field">
        Trainingsnotiz
        <textarea
          name="notes"
          rows={3}
          defaultValue={initialNote}
          disabled={!editable}
          placeholder="z. B. Checkout-Training, Ligavorbereitung, freies Training"
        />
      </label>

      {editable && (
        <div className="training-save-bar">
          <p>Ein Klick pro Mitglied reicht. Die Auswahl kann vor dem Speichern beliebig geändert werden.</p>
          <button className="primary-button">Training abschließen & speichern</button>
        </div>
      )}
    </form>
  );
}
