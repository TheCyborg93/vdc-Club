"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { ensureTrainingSchedule } from "@/lib/training";
import {
  deleteDocumentObject,
  isDocumentStorageConfigured,
} from "@/lib/document-storage";

function value(formData:FormData,key:string) {
  return String(formData.get(key) ?? "").trim();
}

function refreshAll() {
  for (const path of [
    "/",
    "/aufgaben",
    "/dokumente",
    "/archiv",
    "/kalender",
    "/sitzungen",
    "/training",
    "/training/auswertung",
    "/statistik",
    "/sponsoren",
    "/mannschaften",
    "/suche",
    "/hinweise",
    "/admin/daten",
    "/admin/papierkorb",
  ]) {
    revalidatePath(path);
  }
}

export async function moveToTrashAction(formData:FormData) {
  const type=value(formData,"type");
  const id=value(formData,"id");
  const reason=value(formData,"reason") || "Vom Benutzer in den Papierkorb verschoben.";

  if (!id) redirect("/?error=missing");

  const sql=getDb();
  if (!sql) redirect("/?error=database");

  if (type==="task") {
    const actor=await requirePermission("tasks.write");
    const rows=await sql`
      SELECT id::text,title,source_type
      FROM tasks
      WHERE id=${id}::uuid AND deleted_at IS NULL
      LIMIT 1
    `;
    const task=rows[0];
    if (!task) redirect("/aufgaben?error=missing");
    if (task.source_type) redirect("/aufgaben?error=linked_delete");

    await sql`
      UPDATE tasks
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;
    await writeAudit(actor.id,"trash.moved","task",id,{title:String(task.title)});
    refreshAll();
    redirect("/aufgaben?deleted=1");
  }

  if (type==="document") {
    const actor=await requirePermission("documents.write");
    const rows=await sql`
      SELECT id::text,title,category
      FROM documents
      WHERE id=${id}::uuid AND deleted_at IS NULL
      LIMIT 1
    `;
    const doc=rows[0];
    if (!doc) redirect("/dokumente?error=missing");

    await sql`
      UPDATE documents
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;
    await writeAudit(actor.id,"trash.moved","document",id,{
      title:String(doc.title),
      category:String(doc.category),
    });
    refreshAll();
    redirect("/dokumente?deleted=1");
  }

  if (type==="event") {
    const actor=await requirePermission("calendar.write");
    const rows=await sql`
      SELECT e.id::text,e.title,e.source,
        EXISTS(SELECT 1 FROM meetings m WHERE m.event_id=e.id AND m.deleted_at IS NULL) AS has_meeting,
        EXISTS(SELECT 1 FROM training_sessions s WHERE s.event_id=e.id AND s.deleted_at IS NULL) AS has_training
      FROM club_events e
      WHERE e.id=${id}::uuid AND e.deleted_at IS NULL
      LIMIT 1
    `;
    const event=rows[0];
    if (!event) redirect("/kalender?error=missing");
    if (event.source!=="club" || event.has_meeting || event.has_training) {
      redirect("/kalender?error=protected_delete");
    }

    await sql`
      UPDATE club_events
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;
    await writeAudit(actor.id,"trash.moved","club_event",id,{title:String(event.title)});
    refreshAll();
    redirect("/kalender?deleted=1");
  }

  if (type==="meeting") {
    const actor=await requirePermission("meetings.write");
    const rows=await sql`
      SELECT
        m.id::text,m.title,m.status,m.event_id::text,
        EXISTS(SELECT 1 FROM resolutions r WHERE r.meeting_id=m.id) AS has_resolutions,
        EXISTS(SELECT 1 FROM documents d WHERE d.meeting_id=m.id AND d.deleted_at IS NULL) AS has_documents
      FROM meetings m
      WHERE m.id=${id}::uuid AND m.deleted_at IS NULL
      LIMIT 1
    `;
    const meeting=rows[0];
    if (!meeting) redirect("/sitzungen?error=missing");
    if (!["planned","cancelled"].includes(String(meeting.status)) || meeting.has_resolutions || meeting.has_documents) {
      redirect("/sitzungen?error=protected_delete");
    }

    await sql`
      UPDATE meetings
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;

    if (meeting.event_id) {
      await sql`
        UPDATE club_events
        SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason='Mit Sitzung in Papierkorb verschoben.'
        WHERE id=${String(meeting.event_id)}::uuid
      `;
    }

    await writeAudit(actor.id,"trash.moved","meeting",id,{title:String(meeting.title)});
    refreshAll();
    redirect("/sitzungen?deleted=1");
  }

  if (type==="training") {
    const actor=await requirePermission("training.write");
    const rows=await sql`
      SELECT
        s.id::text,s.scheduled_at,s.source,s.status,s.event_id::text,s.attendance_recorded_at,
        EXISTS(SELECT 1 FROM training_attendance a WHERE a.session_id=s.id) AS has_attendance
      FROM training_sessions s
      WHERE s.id=${id}::uuid AND s.deleted_at IS NULL
      LIMIT 1
    `;
    const session=rows[0];
    if (!session) redirect("/training?error=missing");
    if (
      session.source!=="special" ||
      session.status==="completed" ||
      session.attendance_recorded_at ||
      session.has_attendance
    ) {
      redirect(`/training/${id}?error=protected_delete`);
    }

    await sql`
      UPDATE training_sessions
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;

    if (session.event_id) {
      await sql`
        UPDATE club_events
        SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason='Mit Sondertraining in Papierkorb verschoben.'
        WHERE id=${String(session.event_id)}::uuid
      `;
    }

    await writeAudit(actor.id,"trash.moved","training_session",id,{source:"special"});
    refreshAll();
    redirect("/training?deleted=1");
  }

  if (type==="training_pause") {
    const actor=await requirePermission("training.write");
    const rows=await sql`
      SELECT id::text,starts_on,ends_on,reason
      FROM training_blackouts
      WHERE id=${id}::uuid AND deleted_at IS NULL
      LIMIT 1
    `;
    const pause=rows[0];
    if (!pause) redirect("/training?error=pause");

    await sql`
      UPDATE training_sessions
      SET status='planned',notes=NULL
      WHERE source='schedule'
        AND deleted_at IS NULL
        AND notes LIKE ${"pause:" + id + "|%"}
    `;

    await sql`
      UPDATE club_events e
      SET
        title='Vereinstraining',
        description='Regeltraining · Beginn 19:00 Uhr · Ende offen',
        updated_at=now()
      FROM training_sessions s
      WHERE s.event_id=e.id
        AND s.deleted_at IS NULL
        AND e.deleted_at IS NULL
        AND s.source='schedule'
        AND (s.scheduled_at AT TIME ZONE 'Europe/Berlin')::date
            BETWEEN ${String(pause.starts_on)}::date AND ${String(pause.ends_on)}::date
    `;

    await sql`
      UPDATE training_blackouts
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;

    await ensureTrainingSchedule(365);
    await writeAudit(actor.id,"trash.moved","training_pause",id,{
      startsOn:String(pause.starts_on),
      endsOn:String(pause.ends_on),
    });
    refreshAll();
    redirect("/training?pause_removed=1");
  }

  if (type==="training_season") {
    const actor=await requirePermission("training.write");
    const rows=await sql`
      SELECT
        s.id::text,s.label,s.is_active,
        EXISTS(
          SELECT 1 FROM teams t
          WHERE t.deleted_at IS NULL AND t.season=s.label
        ) AS has_teams
      FROM training_seasons s
      WHERE s.id=${id}::uuid AND s.deleted_at IS NULL
      LIMIT 1
    `;
    const season=rows[0];
    if (!season || season.is_active || season.has_teams) {
      redirect(`/training/auswertung?mode=season&season=${id}&error=season_delete`);
    }

    await sql`
      UPDATE training_seasons
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;

    await writeAudit(actor.id,"trash.moved","training_season",id,{label:String(season.label)});
    refreshAll();
    redirect("/training/auswertung?mode=season&deleted=1");
  }

  if (type==="sponsor") {
    const actor=await requirePermission("sponsors.write");
    const rows=await sql`
      SELECT
        s.id::text,s.name,s.status,
        EXISTS(
          SELECT 1 FROM documents d
          WHERE d.sponsor_id=s.id AND d.deleted_at IS NULL
        ) AS has_documents
      FROM sponsors s
      WHERE s.id=${id}::uuid AND s.deleted_at IS NULL
      LIMIT 1
    `;
    const sponsor=rows[0];
    if (
      !sponsor ||
      !["lead","inactive"].includes(String(sponsor.status)) ||
      sponsor.has_documents
    ) {
      redirect("/sponsoren?error=sponsor_delete");
    }

    await sql`
      UPDATE sponsors
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;
    await writeAudit(actor.id,"trash.moved","sponsor",id,{name:String(sponsor.name)});
    refreshAll();
    redirect("/sponsoren?deleted=1");
  }

  if (type==="team") {
    const actor=await requirePermission("teams.write");
    const rows=await sql`
      SELECT
        t.id::text,t.name,t.external_source,t.external_id,
        EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=t.id) AS has_members,
        EXISTS(SELECT 1 FROM club_events e WHERE e.team_id=t.id) AS has_events,
        EXISTS(SELECT 1 FROM integration_entity_links l WHERE l.local_id=t.id) AS has_integration
      FROM teams t
      WHERE t.id=${id}::uuid AND t.deleted_at IS NULL
      LIMIT 1
    `;
    const team=rows[0];
    if (
      !team ||
      team.external_source ||
      team.external_id ||
      team.has_members ||
      team.has_events ||
      team.has_integration
    ) {
      redirect(`/mannschaften/${id}?error=team_delete`);
    }

    await sql`
      UPDATE teams
      SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason=${reason}
      WHERE id=${id}::uuid
    `;
    await writeAudit(actor.id,"trash.moved","team",id,{name:String(team.name)});
    refreshAll();
    redirect("/mannschaften?deleted=1");
  }

  redirect("/?error=invalid_delete");
}

export async function restoreTrashItemAction(formData:FormData) {
  const actor=await requirePermission("settings.manage");
  const sql=getDb();
  if (!sql) redirect("/admin/papierkorb?error=database");

  const type=value(formData,"type");
  const id=value(formData,"id");
  if (!id) redirect("/admin/papierkorb?error=missing");

  if (type==="task") {
    await sql`UPDATE tasks SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${id}::uuid`;
  } else if (type==="document") {
    await sql`UPDATE documents SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${id}::uuid`;
  } else if (type==="event") {
    await sql`UPDATE club_events SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${id}::uuid`;
  } else if (type==="meeting") {
    const rows=await sql`SELECT event_id::text FROM meetings WHERE id=${id}::uuid LIMIT 1`;
    await sql`UPDATE meetings SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${id}::uuid`;
    if (rows[0]?.event_id) {
      await sql`UPDATE club_events SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${String(rows[0].event_id)}::uuid`;
    }
  } else if (type==="training") {
    const rows=await sql`SELECT event_id::text FROM training_sessions WHERE id=${id}::uuid LIMIT 1`;
    await sql`UPDATE training_sessions SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${id}::uuid`;
    if (rows[0]?.event_id) {
      await sql`UPDATE club_events SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${String(rows[0].event_id)}::uuid`;
    }
  } else if (type==="training_pause") {
    const rows=await sql`
      SELECT id::text,starts_on,ends_on,reason
      FROM training_blackouts
      WHERE id=${id}::uuid AND deleted_at IS NOT NULL
      LIMIT 1
    `;
    const pause=rows[0];
    if (!pause) redirect("/admin/papierkorb?error=missing");

    await sql`
      UPDATE training_blackouts
      SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL
      WHERE id=${id}::uuid
    `;

    await sql`
      UPDATE training_sessions
      SET
        status='cancelled',
        notes=${"pause:" + id + "|"} || COALESCE(${pause.reason ? String(pause.reason) : null},'Trainingspause'),
        attendance_recorded_at=NULL,
        completed_at=NULL
      WHERE source='schedule'
        AND deleted_at IS NULL
        AND (scheduled_at AT TIME ZONE 'Europe/Berlin')::date
            BETWEEN ${String(pause.starts_on)}::date AND ${String(pause.ends_on)}::date
        AND scheduled_at>=now()
    `;

    await sql`
      UPDATE club_events e
      SET
        title='Vereinstraining · PAUSE',
        description=COALESCE(${pause.reason ? String(pause.reason) : null},'Trainingspause'),
        updated_at=now()
      FROM training_sessions s
      WHERE s.event_id=e.id
        AND s.deleted_at IS NULL
        AND e.deleted_at IS NULL
        AND s.notes LIKE ${"pause:" + id + "|%"}
    `;
  } else if (type==="training_season") {
    await sql`UPDATE training_seasons SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${id}::uuid`;
  } else if (type==="sponsor") {
    await sql`UPDATE sponsors SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${id}::uuid`;
  } else if (type==="team") {
    await sql`UPDATE teams SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE id=${id}::uuid`;
  } else {
    redirect("/admin/papierkorb?error=invalid");
  }

  await writeAudit(actor.id,"trash.restored",type,id);
  refreshAll();
  redirect("/admin/papierkorb?restored=1");
}

export async function permanentlyDeleteTrashItemAction(formData:FormData) {
  const actor=await requirePermission("settings.manage");
  const sql=getDb();
  if (!sql) redirect("/admin/papierkorb?error=database");

  const type=value(formData,"type");
  const id=value(formData,"id");
  if (!id) redirect("/admin/papierkorb?error=missing");

  if (type==="task") {
    const rows=await sql`SELECT source_type FROM tasks WHERE id=${id}::uuid AND deleted_at IS NOT NULL LIMIT 1`;
    if (!rows.length || rows[0].source_type) redirect("/admin/papierkorb?error=protected");
    await sql`DELETE FROM tasks WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;
  } else if (type==="document") {
    const rows=await sql`
      SELECT storage_type,storage_ref,title
      FROM documents
      WHERE id=${id}::uuid AND deleted_at IS NOT NULL
      LIMIT 1
    `;
    const doc=rows[0];
    if (!doc) redirect("/admin/papierkorb?error=missing");

    const versionFiles=await sql`
      SELECT storage_ref
      FROM document_versions
      WHERE document_id=${id}::uuid
        AND storage_type='upload'
        AND storage_ref IS NOT NULL
    `;

    const storageRefs=[
      ...(doc.storage_type==="upload" && doc.storage_ref ? [String(doc.storage_ref)] : []),
      ...versionFiles.map((row)=>String(row.storage_ref)),
    ];

    await sql`DELETE FROM documents WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;

    if (storageRefs.length && isDocumentStorageConfigured()) {
      for (const storageRef of storageRefs) {
        try {
          await deleteDocumentObject(storageRef);
        } catch (error) {
          await writeAudit(actor.id,"trash.storage_cleanup_failed","document",id,{
            storageRef,
            message:error instanceof Error ? error.message : "unknown",
          });
        }
      }
    }
  } else if (type==="event") {
    const linked=await sql`
      SELECT
        EXISTS(SELECT 1 FROM meetings WHERE event_id=${id}::uuid) AS has_meeting,
        EXISTS(SELECT 1 FROM training_sessions WHERE event_id=${id}::uuid) AS has_training
    `;
    if (linked[0]?.has_meeting || linked[0]?.has_training) redirect("/admin/papierkorb?error=protected");
    await sql`DELETE FROM club_events WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;
  } else if (type==="meeting") {
    const rows=await sql`
      SELECT event_id::text,
        EXISTS(SELECT 1 FROM resolutions r WHERE r.meeting_id=meetings.id) AS has_resolutions,
        EXISTS(SELECT 1 FROM documents d WHERE d.meeting_id=meetings.id) AS has_documents
      FROM meetings
      WHERE id=${id}::uuid AND deleted_at IS NOT NULL
      LIMIT 1
    `;
    const meeting=rows[0];
    if (!meeting || meeting.has_resolutions || meeting.has_documents) redirect("/admin/papierkorb?error=protected");
    await sql`DELETE FROM meetings WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;
    if (meeting.event_id) {
      await sql`
        DELETE FROM club_events
        WHERE id=${String(meeting.event_id)}::uuid
          AND deleted_at IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM meetings WHERE event_id=club_events.id)
          AND NOT EXISTS(SELECT 1 FROM training_sessions WHERE event_id=club_events.id)
      `;
    }
  } else if (type==="training") {
    const rows=await sql`
      SELECT event_id::text,source,attendance_recorded_at,
        EXISTS(SELECT 1 FROM training_attendance a WHERE a.session_id=training_sessions.id) AS has_attendance
      FROM training_sessions
      WHERE id=${id}::uuid AND deleted_at IS NOT NULL
      LIMIT 1
    `;
    const session=rows[0];
    if (!session || session.source!=="special" || session.attendance_recorded_at || session.has_attendance) {
      redirect("/admin/papierkorb?error=protected");
    }
    await sql`DELETE FROM training_sessions WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;
    if (session.event_id) {
      await sql`
        DELETE FROM club_events
        WHERE id=${String(session.event_id)}::uuid
          AND deleted_at IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM meetings WHERE event_id=club_events.id)
          AND NOT EXISTS(SELECT 1 FROM training_sessions WHERE event_id=club_events.id)
      `;
    }
  } else if (type==="training_pause") {
    const rows=await sql`SELECT id::text FROM training_blackouts WHERE id=${id}::uuid AND deleted_at IS NOT NULL LIMIT 1`;
    if (!rows.length) redirect("/admin/papierkorb?error=missing");
    await sql`DELETE FROM training_blackouts WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;
  } else if (type==="training_season") {
    const rows=await sql`
      SELECT
        s.id::text,s.is_active,
        EXISTS(SELECT 1 FROM teams t WHERE t.season=s.label) AS has_teams
      FROM training_seasons s
      WHERE s.id=${id}::uuid AND s.deleted_at IS NOT NULL
      LIMIT 1
    `;
    const season=rows[0];
    if (!season || season.is_active || season.has_teams) redirect("/admin/papierkorb?error=protected");
    await sql`DELETE FROM training_seasons WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;
  } else if (type==="sponsor") {
    const rows=await sql`
      SELECT s.id::text,
        EXISTS(SELECT 1 FROM documents d WHERE d.sponsor_id=s.id) AS has_documents
      FROM sponsors s
      WHERE s.id=${id}::uuid AND s.deleted_at IS NOT NULL
      LIMIT 1
    `;
    if (!rows.length || rows[0].has_documents) redirect("/admin/papierkorb?error=protected");
    await sql`DELETE FROM sponsors WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;
  } else if (type==="team") {
    const rows=await sql`
      SELECT
        t.id::text,t.external_source,t.external_id,
        EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=t.id) AS has_members,
        EXISTS(SELECT 1 FROM club_events e WHERE e.team_id=t.id) AS has_events,
        EXISTS(SELECT 1 FROM integration_entity_links l WHERE l.local_id=t.id) AS has_integration
      FROM teams t
      WHERE t.id=${id}::uuid AND t.deleted_at IS NOT NULL
      LIMIT 1
    `;
    const team=rows[0];
    if (
      !team ||
      team.external_source ||
      team.external_id ||
      team.has_members ||
      team.has_events ||
      team.has_integration
    ) {
      redirect("/admin/papierkorb?error=protected");
    }
    await sql`DELETE FROM teams WHERE id=${id}::uuid AND deleted_at IS NOT NULL`;
  } else {
    redirect("/admin/papierkorb?error=invalid");
  }

  await writeAudit(actor.id,"trash.permanently_deleted",type,id);
  refreshAll();
  redirect("/admin/papierkorb?deleted=1");
}
