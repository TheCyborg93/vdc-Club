import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import {
  dismissNotificationAction,
  markNotificationReadAction,
} from "@/app/hinweise/actions";

export const dynamic="force-dynamic";

const severityLabels: Record<string,string> = {
  critical:"Dringend",
  warning:"Hinweis",
  info:"Info",
};

export default async function NotificationsPage() {
  const user=await requireUser();
  const data=await getNotifications(user,{limit:100});

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Persönlich</span>
          <h1>Hinweise</h1>
          <p>Aufgaben, Fristen und Vorgänge, die für deine Rolle aktuell relevant sind.</p>
        </div>
        <span className={`notification-page-count ${data.unread ? "has-unread" : ""}`}>
          {data.unread} ungelesen
        </span>
      </section>

      <article className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Aktuell</span><h2>Offene Hinweise</h2></div>
          <span className="count-chip">{data.items.length}</span>
        </div>

        <div className="notification-page-list">
          {data.items.length===0 ? (
            <div className="empty-state">Für deine Rolle liegen aktuell keine Hinweise vor.</div>
          ) : data.items.map((item)=>(
            <article
              className={`notification-page-row notification-${item.severity} ${item.read ? "is-read" : ""}`}
              key={item.key}
            >
              <span className="notification-page-dot" />
              <div className="notification-page-main">
                <div>
                  <strong>{item.title}</strong>
                  <span>{severityLabels[item.severity]}</span>
                </div>
                <p>{item.detail}</p>
              </div>
              <div className="notification-page-actions">
                <Link href={item.href} className="mini-button">Öffnen</Link>
                {!item.read && (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="key" value={item.key} />
                    <button className="mini-button">Gelesen</button>
                  </form>
                )}
                <form action={dismissNotificationAction}>
                  <input type="hidden" name="key" value={item.key} />
                  <button className="mini-button">Ausblenden</button>
                </form>
              </div>
            </article>
          ))}
        </div>
      </article>
    </div>
  );
}
