import {
  addAgendaItemAction,
  addMeetingGuestAction,
  updateAttendanceAction,
  updateMeetingGuestAttendanceAction,
} from "@/app/sitzungen/actions";

type Attendee = Record<string, any>;
type Guest = Record<string, any>;

export function MeetingLiveOptions({
  meetingId,
  attendees,
  guests,
}:{
  meetingId:string;
  attendees:Attendee[];
  guests:Guest[];
}) {
  return (
    <details className="meeting-live-options">
      <summary>
        <div>
          <strong>••• Weitere Sitzungsoptionen</strong>
          <span>Nur für Korrekturen, Gäste oder einen nachträglichen TOP öffnen</span>
        </div>
      </summary>

      <div className="meeting-live-options-body">
        <section>
          <div className="meeting-section-head">
            <span>Teilnahme korrigieren</span>
            <b>{attendees.length}</b>
          </div>
          <div className="meeting-live-correction-list">
            {attendees.map((attendee)=>(
              <form action={updateAttendanceAction} key={String(attendee.member_id)}>
                <input type="hidden" name="meetingId" value={meetingId} />
                <input type="hidden" name="memberId" value={String(attendee.member_id)} />
                <div>
                  <strong>{String(attendee.first_name)} {String(attendee.last_name)}</strong>
                  <small>{attendee.voting_eligible===false ? "Nicht stimmberechtigt" : "Stimmberechtigt"}</small>
                </div>
                <select name="attendance" defaultValue={String(attendee.attendance)}>
                  <option value="present">Anwesend</option>
                  <option value="excused">Entschuldigt</option>
                  <option value="absent">Abwesend</option>
                </select>
                <select name="votingEligible" defaultValue={attendee.voting_eligible===false ? "false" : "true"}>
                  <option value="true">Stimmberechtigt</option>
                  <option value="false">Nicht stimmberechtigt</option>
                </select>
                <button className="mini-button">Speichern</button>
              </form>
            ))}
          </div>
        </section>

        <section>
          <div className="meeting-section-head">
            <span>Gäste</span>
            <b>{guests.length}</b>
          </div>
          <div className="meeting-live-correction-list">
            {guests.map((guest)=>(
              <form action={updateMeetingGuestAttendanceAction} key={String(guest.id)}>
                <input type="hidden" name="meetingId" value={meetingId} />
                <input type="hidden" name="guestId" value={String(guest.id)} />
                <div>
                  <strong>{String(guest.name)}</strong>
                  <small>{guest.organization ? String(guest.organization) : "Gast"}</small>
                </div>
                <select name="attendance" defaultValue={String(guest.attendance)}>
                  <option value="present">Anwesend</option>
                  <option value="absent">Abwesend</option>
                </select>
                <button className="mini-button">Speichern</button>
              </form>
            ))}
          </div>

          <form action={addMeetingGuestAction} className="meeting-live-inline-form">
            <input type="hidden" name="meetingId" value={meetingId} />
            <input name="name" required placeholder="Gastname" />
            <input name="organization" placeholder="Organisation / Funktion" />
            <input name="note" placeholder="Hinweis (optional)" />
            <button className="mini-button">Gast nachtragen</button>
          </form>
        </section>

        <section>
          <div className="meeting-section-head">
            <span>Nachträglicher TOP</span>
            <b>Spontan</b>
          </div>
          <p className="muted-copy">Ein während der Sitzung ergänzter TOP wird automatisch als nachträglich hinzugefügt markiert.</p>
          <form action={addAgendaItemAction} className="meeting-live-inline-form">
            <input type="hidden" name="meetingId" value={meetingId} />
            <input name="title" required placeholder="Titel des neuen TOPs" />
            <select name="agendaType" defaultValue="consultation" aria-label="TOP-Typ">
              <option value="information">Information</option>
              <option value="consultation">Beratung</option>
              <option value="decision">Beschluss</option>
            </select>
            <input name="description" placeholder="Sachverhalt / kurze Vorbereitung" />
            <button className="mini-button">TOP hinzufügen</button>
          </form>
        </section>
      </div>
    </details>
  );
}
