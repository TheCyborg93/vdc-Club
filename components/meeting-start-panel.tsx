import { startMeetingAction } from "@/app/sitzungen/actions";

type Attendee = Record<string, any>;
type Guest = Record<string, any>;

export function MeetingStartPanel({
  meetingId,
  attendees,
  guests,
  ready,
  missing,
  chairMemberId,
  minuteTakerMemberId,
  quorumBasis,
  quorumNote,
}: {
  meetingId:string;
  attendees:Attendee[];
  guests:Guest[];
  ready:boolean;
  missing:string[];
  chairMemberId:string;
  minuteTakerMemberId:string;
  quorumBasis:string;
  quorumNote:string;
}) {
  return (
    <section className="meeting-start-panel" id="sitzung-starten">
      <div className="meeting-start-head">
        <div>
          <span className="eyebrow">Sitzungsbeginn</span>
          <h2>Sitzung starten</h2>
          <p>Anwesenheit jetzt bestätigen. Erst danach wird die Beschlussfähigkeit festgestellt.</p>
        </div>
        <span className={ready ? "formal-state formal-ok" : "formal-state formal-open"}>
          {ready ? "Vorbereitung vollständig" : "Vorbereitung offen"}
        </span>
      </div>

      {!ready ? (
        <div className="meeting-start-blocked">
          <strong>Vor dem Start fehlt noch:</strong>
          <div>
            {missing.map((item)=><span key={item}>! {item}</span>)}
          </div>
          <a href="#vorbereitung" className="primary-button">Vorbereitung vervollständigen</a>
        </div>
      ) : (
        <form action={startMeetingAction} className="meeting-start-form">
          <input type="hidden" name="meetingId" value={meetingId} />

          <section className="meeting-start-step">
            <div className="meeting-start-step-number">1</div>
            <div className="meeting-start-step-content">
              <div className="meeting-start-step-head">
                <div>
                  <strong>Wer ist tatsächlich da?</strong>
                  <span>Für jedes eingeladene Vorstandsmitglied auswählen.</span>
                </div>
                <b>{attendees.length} eingeladen</b>
              </div>

              <div className="meeting-start-attendees">
                {attendees.map((attendee)=>{
                  const id=String(attendee.member_id);
                  const isChair=id===chairMemberId;
                  const isTaker=id===minuteTakerMemberId;
                  const current=String(attendee.attendance ?? "invited");
                  return (
                    <article key={id}>
                      <div className="meeting-start-person">
                        <strong>{String(attendee.first_name)} {String(attendee.last_name)}</strong>
                        <span>
                          {attendee.voting_eligible===false ? "Nicht stimmberechtigt" : "Stimmberechtigt"}
                          {isChair ? " · Sitzungsleitung" : ""}
                          {isTaker ? " · Protokollführung" : ""}
                        </span>
                      </div>
                      <div className="meeting-attendance-choice">
                        {[
                          ["present","Anwesend"],
                          ["excused","Entschuldigt"],
                          ["absent","Abwesend"],
                        ].map(([status,label])=>(
                          <label key={status}>
                            <input
                              type="radio"
                              name={"attendee:"+id}
                              value={status}
                              defaultChecked={current===status}
                              required
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          {guests.length>0 && (
            <section className="meeting-start-step">
              <div className="meeting-start-step-number">2</div>
              <div className="meeting-start-step-content">
                <div className="meeting-start-step-head">
                  <div>
                    <strong>Gäste bestätigen</strong>
                    <span>Nur anwesend oder abwesend – Gäste sind nicht Teil der Vorstandsabstimmung.</span>
                  </div>
                  <b>{guests.length} eingeladen</b>
                </div>

                <div className="meeting-start-attendees">
                  {guests.map((guest)=>{
                    const id=String(guest.id);
                    const current=String(guest.attendance ?? "invited");
                    return (
                      <article key={id}>
                        <div className="meeting-start-person">
                          <strong>{String(guest.name)}</strong>
                          <span>{guest.organization ? String(guest.organization) : "Gast"}</span>
                        </div>
                        <div className="meeting-attendance-choice compact">
                          {[
                            ["present","Anwesend"],
                            ["absent","Abwesend"],
                          ].map(([status,label])=>(
                            <label key={status}>
                              <input
                                type="radio"
                                name={"guest:"+id}
                                value={status}
                                defaultChecked={current===status}
                                required
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          <section className="meeting-start-step">
            <div className="meeting-start-step-number">{guests.length>0 ? "3" : "2"}</div>
            <div className="meeting-start-step-content">
              <div className="meeting-start-step-head">
                <div>
                  <strong>Beschlussfähigkeit feststellen</strong>
                  <span>Erst jetzt – auf Basis der tatsächlichen Anwesenheit und eurer Satzung/Geschäftsordnung.</span>
                </div>
              </div>

              <div className="meeting-quorum-choice">
                <label>
                  <input type="radio" name="quorumConfirmed" value="yes" required />
                  <span><b>✓ Ja</b><small>Beschlussfähigkeit festgestellt</small></span>
                </label>
                <label>
                  <input type="radio" name="quorumConfirmed" value="no" required />
                  <span><b>Nein</b><small>Sitzung kann laufen, aber keine Beschlüsse fassen</small></span>
                </label>
              </div>

              <div className="form-grid">
                <label>
                  Grundlage / Satzungshinweis
                  <input name="quorumBasis" defaultValue={quorumBasis} placeholder="Optional, z. B. Satzung § …" />
                </label>
                <label>
                  Bemerkung
                  <input name="quorumNote" defaultValue={quorumNote} placeholder="Optional, z. B. 5 von 6 anwesend" />
                </label>
              </div>
            </div>
          </section>

          <div className="meeting-start-submit">
            <span>Beginn wird beim Klick automatisch gespeichert.</span>
            <button className="primary-button" type="submit">Sitzung jetzt eröffnen</button>
          </div>
        </form>
      )}
    </section>
  );
}
