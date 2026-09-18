"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/access";
import { writeAudit } from "@/lib/audit";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createMeetingAction(formData: FormData) {
  await requirePermission("meetings.write");
  const sql = getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const title = value(formData, "title");
  const startsAt = value(formData, "startsAt");
  const location = value(formData, "location");
  const notes = value(formData, "notes");

  if (!title || !startsAt) redirect("/sitzungen?error=missing");

  const rows = await sql`
    WITH new_event AS (
      INSERT INTO club_events (
        title, event_type, starts_at, location, source, description
      )
      VALUES (
        ${title},
        'board',
        (${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
        ${location || null},
        'club',
        ${notes || null}
      )
      RETURNING id, title, starts_at, location
    ),
    new_meeting AS (
      INSERT INTO meetings (event_id, title, starts_at, location, status, notes)
      SELECT id, title, starts_at, location, 'planned', ${notes || null}
      FROM new_event
      RETURNING id
    )
    SELECT id::text FROM new_meeting
  `;

  const id = rows[0]?.id;
  revalidatePath("/sitzungen");
  revalidatePath("/kalender");
  revalidatePath("/");
  redirect(id ? `/sitzungen/${id}?created=1` : "/sitzungen");
}

export async function updateMeetingDetailsAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const title=value(formData,"title");
  const startsAt=value(formData,"startsAt");
  const location=value(formData,"location");
  const notes=value(formData,"notes");

  if (!meetingId || !title || !startsAt) {
    redirect(`/sitzungen/${meetingId}?error=missing`);
  }

  const rows=await sql`
    UPDATE meetings
    SET
      title=${title},
      starts_at=(${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
      location=${location || null},
      notes=${notes || null},
      updated_at=now()
    WHERE id=${meetingId}::uuid
      AND deleted_at IS NULL
      AND status IN ('planned','cancelled')
    RETURNING event_id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=meeting_locked`);

  if (rows[0].event_id) {
    await sql`
      UPDATE club_events
      SET
        title=${title},
        starts_at=(${startsAt}::timestamp AT TIME ZONE 'Europe/Berlin'),
        location=${location || null},
        description=${notes || null},
        updated_at=now()
      WHERE id=${String(rows[0].event_id)}::uuid
        AND deleted_at IS NULL
    `;
  }

  await writeAudit(actor.id,"meeting.updated","meeting",meetingId,{title,startsAt,location});

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath("/sitzungen");
  revalidatePath("/kalender");
  revalidatePath("/");
  redirect(`/sitzungen/${meetingId}?saved=1`);
}

export async function addAgendaItemAction(formData: FormData) {
  await requirePermission("meetings.write");
  const sql = getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId = value(formData, "meetingId");
  const title = value(formData, "title");
  const description = value(formData, "description");

  if (!meetingId || !title) redirect(`/sitzungen/${meetingId}?error=missing`);

  await sql`
    INSERT INTO agenda_items (meeting_id, position, title, description, status)
    SELECT
      ${meetingId}::uuid,
      COALESCE(MAX(position), 0) + 1,
      ${title},
      ${description || null},
      'open'
    FROM agenda_items
    WHERE meeting_id = ${meetingId}::uuid
      AND EXISTS (
        SELECT 1 FROM meetings m
        WHERE m.id=${meetingId}::uuid
          AND m.deleted_at IS NULL
          AND m.status IN ('planned','running')
      )
  `;

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?agenda=1`);
}

export async function updateAgendaStatusAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const statusRaw=value(formData,"status");
  const status=["open","active","done","deferred"].includes(statusRaw) ? statusRaw : "open";

  const rows=await sql`
    UPDATE agenda_items
    SET status=${status}
    WHERE id=${agendaItemId}::uuid
      AND meeting_id=${meetingId}::uuid
      AND EXISTS (
        SELECT 1
        FROM meetings m
        WHERE m.id=${meetingId}::uuid
          AND m.deleted_at IS NULL
          AND m.status='running'
      )
    RETURNING id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=meeting_locked`);

  await writeAudit(actor.id,"agenda.status_changed","agenda_item",agendaItemId,{
    meetingId,
    status,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}`);
}

export async function updateAgendaNotesAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const notes=value(formData,"notes");

  const rows=await sql`
    UPDATE agenda_items
    SET notes=${notes || null}
    WHERE id=${agendaItemId}::uuid
      AND meeting_id=${meetingId}::uuid
      AND EXISTS (
        SELECT 1
        FROM meetings m
        WHERE m.id=${meetingId}::uuid
          AND m.deleted_at IS NULL
          AND m.status='running'
      )
    RETURNING id::text,title
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=meeting_locked`);

  await writeAudit(actor.id,"agenda.notes_updated","agenda_item",agendaItemId,{
    meetingId,
    title:String(rows[0].title),
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  redirect(`/sitzungen/${meetingId}?notes=1`);
}

export async function deleteAgendaItemAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  if (!meetingId || !agendaItemId) redirect(`/sitzungen/${meetingId}?error=missing`);

  const rows=await sql`
    SELECT
      ai.id::text,
      ai.title,
      m.status AS meeting_status,
      m.deleted_at,
      EXISTS(SELECT 1 FROM resolutions r WHERE r.agenda_item_id=ai.id) AS has_resolution
    FROM agenda_items ai
    JOIN meetings m ON m.id=ai.meeting_id
    WHERE ai.id=${agendaItemId}::uuid
      AND ai.meeting_id=${meetingId}::uuid
    LIMIT 1
  `;

  const item=rows[0];
  if (
    !item ||
    item.deleted_at ||
    !["planned","running"].includes(String(item.meeting_status)) ||
    item.has_resolution
  ) {
    redirect(`/sitzungen/${meetingId}?error=agenda_delete`);
  }

  await sql`
    DELETE FROM agenda_items
    WHERE id=${agendaItemId}::uuid
      AND meeting_id=${meetingId}::uuid
  `;

  await writeAudit(actor.id,"agenda.deleted","agenda_item",agendaItemId,{
    title:String(item.title),
    meetingId,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?agenda_deleted=1`);
}
export async function addAttendeeAction(formData: FormData) {
  await requirePermission("meetings.write");
  const sql = getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId = value(formData, "meetingId");
  const memberId = value(formData, "memberId");
  if (!meetingId || !memberId) redirect(`/sitzungen/${meetingId}?error=attendee`);

  await sql`
    INSERT INTO meeting_attendees (meeting_id, member_id, attendance)
    SELECT ${meetingId}::uuid, ${memberId}::uuid, 'invited'
    WHERE EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id=${meetingId}::uuid
        AND m.deleted_at IS NULL
    )
    ON CONFLICT (meeting_id, member_id) DO NOTHING
  `;

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}`);
}

export async function updateAttendanceAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const memberId=value(formData,"memberId");
  const attendanceRaw=value(formData,"attendance");
  const attendance=["invited","present","absent","excused"].includes(attendanceRaw)
    ? attendanceRaw
    : "invited";

  const rows=await sql`
    UPDATE meeting_attendees
    SET attendance=${attendance}
    WHERE meeting_id=${meetingId}::uuid
      AND member_id=${memberId}::uuid
      AND EXISTS (
        SELECT 1
        FROM meetings m
        WHERE m.id=${meetingId}::uuid
          AND m.deleted_at IS NULL
          AND m.status IN ('planned','running')
      )
    RETURNING member_id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=meeting_locked`);

  await writeAudit(actor.id,"meeting.attendance_changed","meeting",meetingId,{
    memberId,
    attendance,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  redirect(`/sitzungen/${meetingId}`);
}

export async function updateMeetingStatusAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const statusRaw=value(formData,"status");
  const status=["planned","running","completed","cancelled"].includes(statusRaw)
    ? statusRaw
    : "planned";

  const beforeRows=await sql`
    SELECT id::text,title,status,starts_at,event_id::text
    FROM meetings
    WHERE id=${meetingId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const before=beforeRows[0];
  if (!before) redirect("/sitzungen?error=missing");

  const current=String(before.status);
  const transitions:Record<string,string[]>={
    planned:["running","cancelled"],
    cancelled:["planned"],
    running:["completed"],
    completed:["running"],
  };

  if (status!==current && !(transitions[current] ?? []).includes(status)) {
    redirect(`/sitzungen/${meetingId}?error=invalid_transition`);
  }

  if (status==="completed") {
    const checks=await sql`
      SELECT
        count(*) FILTER (WHERE ai.status IN ('open','active'))::int AS open_agenda,
        (
          SELECT count(*)::int
          FROM meeting_attendees ma
          WHERE ma.meeting_id=${meetingId}::uuid
            AND ma.attendance='invited'
        ) AS unresolved_attendance
      FROM agenda_items ai
      WHERE ai.meeting_id=${meetingId}::uuid
    `;
    const check=checks[0] ?? {};
    if (Number(check.open_agenda ?? 0)>0) {
      redirect(`/sitzungen/${meetingId}?error=open_agenda`);
    }
    if (Number(check.unresolved_attendance ?? 0)>0) {
      redirect(`/sitzungen/${meetingId}?error=attendance_open`);
    }
  }

  await sql`
    UPDATE meetings
    SET
      status=${status},
      ended_at=CASE
        WHEN ${status}='completed' THEN COALESCE(ended_at,now())
        WHEN ${status}='running' THEN NULL
        ELSE ended_at
      END,
      updated_at=now()
    WHERE id=${meetingId}::uuid
      AND deleted_at IS NULL
  `;

  if (status==="completed") {
    await sql`
      INSERT INTO documents (
        title,category,storage_type,storage_ref,status,
        document_date,meeting_id,notes
      )
      SELECT
        'Protokoll · ' || m.title,
        'Protokoll',
        'internal',
        '/sitzungen/' || m.id::text || '/protokoll',
        'active',
        (m.starts_at AT TIME ZONE 'Europe/Berlin')::date,
        m.id,
        'Automatisch beim Beenden der Sitzung registriert.'
      FROM meetings m
      WHERE m.id=${meetingId}::uuid
        AND m.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM documents d
          WHERE d.meeting_id=m.id
            AND d.category='Protokoll'
            AND d.deleted_at IS NULL
        )
    `;
  }

  await writeAudit(actor.id,"meeting.status_changed","meeting",meetingId,{
    title:String(before.title ?? ""),
    before:current,
    after:status,
    protocolRegistered:status==="completed",
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath("/sitzungen");
  revalidatePath("/dokumente");
  revalidatePath("/archiv");
  revalidatePath("/");
  redirect(`/sitzungen/${meetingId}?status=${status}`);
}

export async function createResolutionFromAgendaAction(formData: FormData) {
  const actor = await requirePermission("resolutions.write");
  const sql = getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId = value(formData, "meetingId");
  const agendaItemId = value(formData, "agendaItemId");
  const title = value(formData, "title");
  const decisionText = value(formData, "decisionText");
  const yes = Number(value(formData, "votesYes") || "0");
  const no = Number(value(formData, "votesNo") || "0");
  const abstain = Number(value(formData, "votesAbstain") || "0");
  const createTaskRequested = formData.get("createTask") === "on";
  const createTask = createTaskRequested && hasPermission(actor.roles, "tasks.write");
  const taskOwner = value(formData, "taskOwner");
  const taskDueDate = value(formData, "taskDueDate");

  if (!meetingId || !agendaItemId || !title || !decisionText) {
    redirect(`/sitzungen/${meetingId}?error=resolution`);
  }

  await sql`
    WITH counter AS (
      INSERT INTO resolution_counters (year, last_number)
      VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::int, 1)
      ON CONFLICT (year)
      DO UPDATE SET last_number = resolution_counters.last_number + 1
      RETURNING year, last_number
    ),
    new_resolution AS (
      INSERT INTO resolutions (
        meeting_id,
        agenda_item_id,
        title,
        decision_text,
        votes_yes,
        votes_no,
        votes_abstain,
        status,
        decided_at,
        resolution_number
      )
      SELECT
        ${meetingId}::uuid,
        ${agendaItemId}::uuid,
        ${title},
        ${decisionText},
        ${Number.isFinite(yes) ? yes : 0},
        ${Number.isFinite(no) ? no : 0},
        ${Number.isFinite(abstain) ? abstain : 0},
        'open',
        now(),
        year::text || '-' || lpad(last_number::text, 3, '0')
      FROM counter
      WHERE EXISTS (
        SELECT 1 FROM meetings m
        WHERE m.id=${meetingId}::uuid
          AND m.deleted_at IS NULL
          AND m.status='running'
      )
      RETURNING id, title
    ),
    new_task AS (
      INSERT INTO tasks (
        title, description, category, status, priority,
        due_date, owner_member_id, source_type, source_id
      )
      SELECT
        'Beschluss umsetzen: ' || title,
        ${decisionText},
        'Beschluss',
        'open',
        'medium',
        ${taskDueDate || null}::date,
        ${taskOwner || null}::uuid,
        'resolution',
        id
      FROM new_resolution
      WHERE ${createTask}
      RETURNING id
    )
    UPDATE agenda_items
    SET status = 'done'
    WHERE id = ${agendaItemId}::uuid
      AND meeting_id = ${meetingId}::uuid
      AND EXISTS (SELECT 1 FROM new_resolution)
  `;

  const created=await sql`
    SELECT id::text
    FROM resolutions
    WHERE meeting_id=${meetingId}::uuid
      AND agenda_item_id=${agendaItemId}::uuid
    LIMIT 1
  `;
  if (!created.length) redirect(`/sitzungen/${meetingId}?error=meeting_locked`);

  await writeAudit(actor.id,"resolution.created","resolution",String(created[0].id),{
    meetingId,
    agendaItemId,
    title,
    votesYes:Number.isFinite(yes) ? yes : 0,
    votesNo:Number.isFinite(no) ? no : 0,
    votesAbstain:Number.isFinite(abstain) ? abstain : 0,
    taskCreated:createTask,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath("/beschluesse");
  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect(`/sitzungen/${meetingId}?resolution=1`);
}
