import { requirePermission } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  permanentlyDeleteTrashItemAction,
  restoreTrashItemAction,
} from "@/app/admin/papierkorb/actions";

export const dynamic="force-dynamic";

function formatDateTime(value:unknown) {
  if (!value) return "–";
  const date=new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "–"
    : new Intl.DateTimeFormat("de-DE",{
        day:"2-digit",
        month:"2-digit",
        year:"numeric",
        hour:"2-digit",
        minute:"2-digit",
        timeZone:"Europe/Berlin",
      }).format(date);
}

type TrashItem = {
  id:string;
  type:string;
  title:string;
  detail:string;
  deleted_at:unknown;
  delete_reason:unknown;
  deleted_by_name:unknown;
};

export default async function TrashPage({
  searchParams,
}: {
  searchParams:Promise<{
    restored?:string;
    deleted?:string;
    error?:string;
  }>;
}) {
  await requirePermission("settings.manage");
  const sql=getDb();
  const params=await searchParams;

  const [tasks,documents,events,meetings,trainings]=sql
    ? await Promise.all([
        sql`
          SELECT
            t.id::text,
            'task' AS type,
            t.title,
            COALESCE(t.category,'Allgemein') AS detail,
            t.deleted_at,
            t.delete_reason,
            u.display_name AS deleted_by_name
          FROM tasks t
          LEFT JOIN app_users u ON u.id=t.deleted_by
          WHERE t.deleted_at IS NOT NULL
          ORDER BY t.deleted_at DESC
        `,
        sql`
          SELECT
            d.id::text,
            'document' AS type,
            d.title,
            d.category AS detail,
            d.deleted_at,
            d.delete_reason,
            u.display_name AS deleted_by_name
          FROM documents d
          LEFT JOIN app_users u ON u.id=d.deleted_by
          WHERE d.deleted_at IS NOT NULL
          ORDER BY d.deleted_at DESC
        `,
        sql`
          SELECT
            e.id::text,
            'event' AS type,
            e.title,
            COALESCE(e.event_type,'Termin') AS detail,
            e.deleted_at,
            e.delete_reason,
            u.display_name AS deleted_by_name
          FROM club_events e
          LEFT JOIN app_users u ON u.id=e.deleted_by
          WHERE e.deleted_at IS NOT NULL
            AND NOT EXISTS(
              SELECT 1 FROM meetings m
              WHERE m.event_id=e.id AND m.deleted_at IS NOT NULL
            )
            AND NOT EXISTS(
              SELECT 1 FROM training_sessions s
              WHERE s.event_id=e.id AND s.deleted_at IS NOT NULL
            )
          ORDER BY e.deleted_at DESC
        `,
        sql`
          SELECT
            m.id::text,
            'meeting' AS type,
            m.title,
            'Sitzung · ' || to_char(m.starts_at AT TIME ZONE 'Europe/Berlin','DD.MM.YYYY HH24:MI') AS detail,
            m.deleted_at,
            m.delete_reason,
            u.display_name AS deleted_by_name
          FROM meetings m
          LEFT JOIN app_users u ON u.id=m.deleted_by
          WHERE m.deleted_at IS NOT NULL
          ORDER BY m.deleted_at DESC
        `,
        sql`
          SELECT
            s.id::text,
            'training' AS type,
            'Sondertraining' AS title,
            to_char(s.scheduled_at AT TIME ZONE 'Europe/Berlin','DD.MM.YYYY HH24:MI') AS detail,
            s.deleted_at,
            s.delete_reason,
            u.display_name AS deleted_by_name
          FROM training_sessions s
          LEFT JOIN app_users u ON u.id=s.deleted_by
          WHERE s.deleted_at IS NOT NULL
          ORDER BY s.deleted_at DESC
        `,
      ])
    : [[],[],[],[],[]];

  const groups:{label:string;items:TrashItem[]}[]=[
    {label:"Aufgaben",items:tasks as TrashItem[]},
    {label:"Dokumente",items:documents as TrashItem[]},
    {label:"Kalendertermine",items:events as TrashItem[]},
    {label:"Sitzungen",items:meetings as TrashItem[]},
    {label:"Sondertrainings",items:trainings as TrashItem[]},
  ];
  const total=groups.reduce((sum,group)=>sum+group.items.length,0);

  const errors:Record<string,string>={
    database:"Datenbank ist nicht verfügbar.",
    missing:"Der Eintrag wurde nicht gefunden.",
    invalid:"Dieser Eintragstyp wird nicht unterstützt.",
    protected:"Der Eintrag ist mit schützenswerten Vereinsdaten verknüpft und kann nicht endgültig gelöscht werden.",
  };

  return (
    <div className="page-stack trash-page">
      <section className="page-heading admin-heading">
        <div>
          <span className="eyebrow">Administration</span>
          <h1>Papierkorb</h1>
          <p>Gelöschte Vereinsdaten wiederherstellen oder – nur als Admin – endgültig entfernen.</p>
        </div>
        <span className="admin-lock-chip">ADMIN · {total}</span>
      </section>

      {params.restored && <div className="form-success">Eintrag wurde wiederhergestellt.</div>}
      {params.deleted && <div className="form-success">Eintrag wurde endgültig gelöscht.</div>}
      {params.error && <div className="form-error">{errors[params.error] ?? "Aktion konnte nicht ausgeführt werden."}</div>}

      <article className="panel trash-warning-panel">
        <strong>Endgültiges Löschen ist nicht rückgängig zu machen.</strong>
        <p>Hochgeladene Dokumentdateien werden beim endgültigen Löschen zusätzlich aus dem privaten Storage entfernt. Beschlüsse und Finanzbuchungen werden bewusst nicht über diesen Papierkorb gelöscht.</p>
      </article>

      {total===0 ? (
        <article className="panel"><div className="empty-state">Der Papierkorb ist leer.</div></article>
      ) : groups.filter((group)=>group.items.length>0).map((group)=>(
        <article className="panel" key={group.label}>
          <div className="panel-head">
            <div><span className="eyebrow">Papierkorb</span><h2>{group.label}</h2></div>
            <span className="count-chip">{group.items.length}</span>
          </div>

          <div className="trash-list">
            {group.items.map((item)=>(
              <div className="trash-row" key={item.type+item.id}>
                <div className="trash-row-main">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <small>
                    Gelöscht {formatDateTime(item.deleted_at)}
                    {item.deleted_by_name ? " · "+String(item.deleted_by_name) : ""}
                  </small>
                  {item.delete_reason && <p>{String(item.delete_reason)}</p>}
                </div>

                <div className="trash-row-actions">
                  <form action={restoreTrashItemAction}>
                    <input type="hidden" name="type" value={item.type} />
                    <input type="hidden" name="id" value={item.id} />
                    <button className="mini-button">Wiederherstellen</button>
                  </form>

                  <form action={permanentlyDeleteTrashItemAction}>
                    <input type="hidden" name="type" value={item.type} />
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmSubmitButton
                      message={"„"+item.title+"“ wirklich ENDGÜLTIG löschen? Diese Aktion kann nicht rückgängig gemacht werden."}
                      className="mini-button danger-button"
                    >
                      Endgültig löschen
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
