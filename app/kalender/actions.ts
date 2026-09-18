"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const allowedTypes = new Set(["club", "league", "training", "tournament", "board"]);

export async function createEventAction(formData: FormData) {
  await requirePermission("calendar.write");
  const sql = getDb();
  if (!sql) redirect("/kalender?error=database");

  const title = value(formData, "title");
  const eventTypeRaw = value(formData, "eventType");
  const eventType = allowedTypes.has(eventTypeRaw) ? eventTypeRaw : "club";
  const startsAt = value(formData, "startsAt");
  const endsAt = value(formData, "endsAt");
  const location = value(formData, "location");
  const description = value(formData, "description");
  const createMeeting = formData.get("createMeeting") === "on";

  if (!title || !startsAt) redirect("/kalender?error=missing");

  if (createMeeting) {
    await sql`
      WITH new_event AS (
        INSERT INTO club_events (
          title, event_type, starts_at, ends_at, location, source, description
        )
        VALUES (
          ${title},
          'board',
          (${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
          CASE
            WHEN ${endsAt || null}::text IS NULL THEN NULL
            ELSE (${endsAt || null}::timestamp AT TIME ZONE 'Europe/Berlin')
          END,
          ${location || null},
          'club',
          ${description || null}
        )
        RETURNING id, title, starts_at, location
      )
      INSERT INTO meetings (event_id, title, starts_at, location, status, notes)
      SELECT id, title, starts_at, location, 'planned', ${description || null}
      FROM new_event
    `;
  } else {
    await sql`
      INSERT INTO club_events (
        title, event_type, starts_at, ends_at, location, source, description
      )
      VALUES (
        ${title},
        ${eventType},
        (${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
        CASE
          WHEN ${endsAt || null}::text IS NULL THEN NULL
          ELSE (${endsAt || null}::timestamp AT TIME ZONE 'Europe/Berlin')
        END,
        ${location || null},
        'club',
        ${description || null}
      )
    `;
  }

  revalidatePath("/kalender");
  revalidatePath("/sitzungen");
  revalidatePath("/");
  redirect(createMeeting ? "/sitzungen?created=1" : "/kalender?created=1");
}

export async function deleteEventAction(formData: FormData) {
  const actor=await requirePermission("calendar.write");
  const sql=getDb();
  if (!sql) redirect("/kalender?error=database");

  const id=value(formData,"id");
  if (!id) redirect("/kalender?error=missing");

  const rows=await sql`
    SELECT id::text,title,source
    FROM club_events
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
      AND source='club'
      AND NOT EXISTS (
        SELECT 1 FROM meetings
        WHERE meetings.event_id=club_events.id
          AND meetings.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM training_sessions
        WHERE training_sessions.event_id=club_events.id
          AND training_sessions.deleted_at IS NULL
      )
    LIMIT 1
  `;

  if (!rows.length) redirect("/kalender?error=protected_delete");

  await sql`
    UPDATE club_events
    SET deleted_at=now(),deleted_by=${actor.id}::uuid,delete_reason='Über Kalender gelöscht.'
    WHERE id=${id}::uuid
  `;

  await writeAudit(actor.id,"trash.moved","club_event",id,{title:String(rows[0].title)});
  revalidatePath("/kalender");
  revalidatePath("/admin/papierkorb");
  revalidatePath("/");
  redirect("/kalender?deleted=1");
}
