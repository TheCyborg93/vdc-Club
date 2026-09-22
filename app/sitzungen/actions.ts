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

  if (status==="active") {
    await sql`
      UPDATE agenda_items
      SET status='open'
      WHERE meeting_id=${meetingId}::uuid
        AND status='active'
        AND id<>${agendaItemId}::uuid
    `;
  }

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
    RETURNING id::text,position
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=meeting_locked`);

  await writeAudit(actor.id,"agenda.status_changed","agenda_item",agendaItemId,{
    meetingId,
    status,
  });

  let targetId=agendaItemId;
  if (["done","deferred"].includes(status)) {
    const next=await sql`
      SELECT id::text
      FROM agenda_items
      WHERE meeting_id=${meetingId}::uuid
        AND position>${Number(rows[0].position)}
        AND status IN ('open','active')
      ORDER BY position
      LIMIT 1
    `;
    if (next[0]?.id) {
      targetId=String(next[0].id);
    } else {
      const firstOpen=await sql`
        SELECT id::text
        FROM agenda_items
        WHERE meeting_id=${meetingId}::uuid
          AND status IN ('open','active')
        ORDER BY position
        LIMIT 1
      `;
      if (firstOpen[0]?.id) targetId=String(firstOpen[0].id);
    }
  }

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(`/sitzungen/${meetingId}?top=${targetId}`);
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
  redirect(`/sitzungen/${meetingId}?top=${agendaItemId}&notes=1`);
}

export async function saveAgendaNotesInlineAction(
  meetingId:string,
  agendaItemId:string,
  notes:string,
) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) return {ok:false,error:"database"};

  const rows=await sql`
    UPDATE agenda_items
    SET notes=${notes.trim() || null}
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

  if (!rows.length) return {ok:false,error:"locked"};

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);

  return {ok:true,savedAt:new Date().toISOString()};
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
    SELECT id::text,title,status,starts_at,event_id::text,minutes_status
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

  if (current==="completed" && status==="running" && String(before.minutes_status)==="archived") {
    redirect(`/sitzungen/${meetingId}?error=minutes_archived`);
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
      minutes_status=CASE
        WHEN ${status}='running' AND status='completed' AND minutes_status<>'archived' THEN 'draft'
        ELSE minutes_status
      END,
      minutes_version=CASE
        WHEN ${status}='running' AND status='completed' AND minutes_status IN ('review','approved')
          THEN minutes_version+1
        ELSE minutes_version
      END,
      minutes_return_note=CASE
        WHEN ${status}='running' AND status='completed' AND minutes_status<>'archived'
          THEN 'Sitzung wurde wieder geöffnet. Protokoll muss erneut geprüft werden.'
        ELSE minutes_return_note
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
        'review',
        (m.starts_at AT TIME ZONE 'Europe/Berlin')::date,
        m.id,
        'Automatisch beim Beenden der Sitzung registriert · Freigabe noch erforderlich.'
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

  const nextAgenda=await sql`
    SELECT next_item.id::text
    FROM agenda_items current_item
    LEFT JOIN LATERAL (
      SELECT ai.id
      FROM agenda_items ai
      WHERE ai.meeting_id=current_item.meeting_id
        AND ai.position>current_item.position
        AND ai.status IN ('open','active')
      ORDER BY ai.position
      LIMIT 1
    ) next_item ON true
    WHERE current_item.id=${agendaItemId}::uuid
    LIMIT 1
  `;
  const nextTop=nextAgenda[0]?.id ? String(nextAgenda[0].id) : agendaItemId;

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath("/beschluesse");
  revalidatePath("/aufgaben");
  revalidatePath("/");
  redirect(`/sitzungen/${meetingId}?top=${nextTop}&resolution=1`);
}


function canApproveMinutes(roles:string[]) {
  return roles.some((role)=>["chair","vice_chair","board","admin"].includes(role));
}

export async function updateMeetingOfficersAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const chairMemberId=value(formData,"chairMemberId");
  const minuteTakerMemberId=value(formData,"minuteTakerMemberId");

  const rows=await sql`
    UPDATE meetings
    SET
      chair_member_id=${chairMemberId || null}::uuid,
      minute_taker_member_id=${minuteTakerMemberId || null}::uuid,
      updated_at=now()
    WHERE id=${meetingId}::uuid
      AND deleted_at IS NULL
      AND minutes_status='draft'
    RETURNING id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}?error=meeting_locked`);

  await writeAudit(actor.id,"meeting.officers_updated","meeting",meetingId,{
    chairMemberId:chairMemberId || null,
    minuteTakerMemberId:minuteTakerMemberId || null,
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  redirect(`/sitzungen/${meetingId}?officers=1`);
}

export async function updateMeetingMinutesTextAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const intro=value(formData,"minutesIntro");
  const closing=value(formData,"minutesClosing");

  const rows=await sql`
    UPDATE meetings
    SET
      minutes_intro=${intro || null},
      minutes_closing=${closing || null},
      updated_at=now()
    WHERE id=${meetingId}::uuid
      AND deleted_at IS NULL
      AND minutes_status='draft'
    RETURNING id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);

  await writeAudit(actor.id,"meeting.minutes_text_updated","meeting",meetingId,{});
  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  redirect(`/sitzungen/${meetingId}/protokoll?saved=1`);
}

export async function submitMeetingMinutesAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");

  const rows=await sql`
    SELECT
      id::text,status,minutes_status,minutes_version,
      minutes_intro,minutes_closing,
      chair_member_id::text,minute_taker_member_id::text
    FROM meetings
    WHERE id=${meetingId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const meeting=rows[0];
  if (!meeting) redirect("/sitzungen?error=missing");
  if (String(meeting.status)!=="completed") {
    redirect(`/sitzungen/${meetingId}/protokoll?error=meeting_not_completed`);
  }
  if (String(meeting.minutes_status)!=="draft") {
    redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);
  }
  if (!meeting.chair_member_id || !meeting.minute_taker_member_id) {
    redirect(`/sitzungen/${meetingId}/protokoll?error=officers_missing`);
  }

  await sql`
    INSERT INTO meeting_minutes_revisions (
      meeting_id,version,status,intro,closing,return_note,changed_by,change_note
    )
    VALUES (
      ${meetingId}::uuid,
      ${Number(meeting.minutes_version ?? 1)}::int,
      'review',
      ${meeting.minutes_intro ?? null},
      ${meeting.minutes_closing ?? null},
      NULL,
      ${actor.id}::uuid,
      'Zur Prüfung eingereicht'
    )
  `;

  await sql`
    UPDATE meetings
    SET
      minutes_status='review',
      minutes_return_note=NULL,
      minutes_submitted_at=now(),
      minutes_submitted_by=${actor.id}::uuid,
      updated_at=now()
    WHERE id=${meetingId}::uuid
  `;

  await sql`
    UPDATE documents
    SET
      status='review',
      notes='Protokoll zur Freigabe eingereicht.',
      updated_at=now()
    WHERE meeting_id=${meetingId}::uuid
      AND category='Protokoll'
      AND deleted_at IS NULL
  `;

  await writeAudit(actor.id,"meeting.minutes_submitted","meeting",meetingId,{});
  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath("/dokumente");
  redirect(`/sitzungen/${meetingId}/protokoll?submitted=1`);
}

export async function returnMeetingMinutesAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  if (!canApproveMinutes(actor.roles)) redirect("/sitzungen?error=forbidden");

  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const returnNote=value(formData,"returnNote");
  if (!returnNote) redirect(`/sitzungen/${meetingId}/protokoll?error=return_note`);

  const rows=await sql`
    UPDATE meetings
    SET
      minutes_status='draft',
      minutes_return_note=${returnNote},
      minutes_version=minutes_version+1,
      minutes_approved_at=NULL,
      minutes_approved_by=NULL,
      updated_at=now()
    WHERE id=${meetingId}::uuid
      AND minutes_status='review'
      AND deleted_at IS NULL
    RETURNING minutes_version,minutes_intro,minutes_closing
  `;

  const meeting=rows[0];
  if (!meeting) redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);

  await sql`
    INSERT INTO meeting_minutes_revisions (
      meeting_id,version,status,intro,closing,return_note,changed_by,change_note
    )
    VALUES (
      ${meetingId}::uuid,
      ${Number(meeting.minutes_version ?? 1)}::int,
      'draft',
      ${meeting.minutes_intro ?? null},
      ${meeting.minutes_closing ?? null},
      ${returnNote},
      ${actor.id}::uuid,
      'Zur Überarbeitung zurückgegeben'
    )
  `;

  await writeAudit(actor.id,"meeting.minutes_returned","meeting",meetingId,{returnNote});
  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  redirect(`/sitzungen/${meetingId}/protokoll?returned=1`);
}

export async function approveMeetingMinutesAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  if (!canApproveMinutes(actor.roles)) redirect("/sitzungen?error=forbidden");

  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");

  const rows=await sql`
    UPDATE meetings
    SET
      minutes_status='approved',
      minutes_return_note=NULL,
      minutes_approved_at=now(),
      minutes_approved_by=${actor.id}::uuid,
      updated_at=now()
    WHERE id=${meetingId}::uuid
      AND minutes_status='review'
      AND deleted_at IS NULL
    RETURNING minutes_version,minutes_intro,minutes_closing
  `;

  const meeting=rows[0];
  if (!meeting) redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);

  await sql`
    INSERT INTO meeting_minutes_revisions (
      meeting_id,version,status,intro,closing,changed_by,change_note
    )
    VALUES (
      ${meetingId}::uuid,
      ${Number(meeting.minutes_version ?? 1)}::int,
      'approved',
      ${meeting.minutes_intro ?? null},
      ${meeting.minutes_closing ?? null},
      ${actor.id}::uuid,
      'Protokoll freigegeben'
    )
  `;

  await sql`
    UPDATE documents
    SET
      status='active',
      notes='Freigegebenes Sitzungsprotokoll.',
      updated_at=now()
    WHERE meeting_id=${meetingId}::uuid
      AND category='Protokoll'
      AND deleted_at IS NULL
  `;

  await writeAudit(actor.id,"meeting.minutes_approved","meeting",meetingId,{});
  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath("/dokumente");
  redirect(`/sitzungen/${meetingId}/protokoll?approved=1`);
}

export async function archiveMeetingMinutesAction(formData: FormData) {
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");

  const rows=await sql`
    UPDATE meetings
    SET
      minutes_status='archived',
      minutes_archived_at=now(),
      minutes_archived_by=${actor.id}::uuid,
      updated_at=now()
    WHERE id=${meetingId}::uuid
      AND minutes_status='approved'
      AND deleted_at IS NULL
    RETURNING id::text
  `;

  if (!rows.length) redirect(`/sitzungen/${meetingId}/protokoll?error=minutes_locked`);

  const archiveSnapshot=await sql`
    SELECT minutes_version,minutes_intro,minutes_closing
    FROM meetings
    WHERE id=${meetingId}::uuid
    LIMIT 1
  `;
  const snapshot=archiveSnapshot[0];

  await sql`
    INSERT INTO meeting_minutes_revisions (
      meeting_id,version,status,intro,closing,changed_by,change_note
    )
    VALUES (
      ${meetingId}::uuid,
      ${Number(snapshot?.minutes_version ?? 1)}::int,
      'archived',
      ${snapshot?.minutes_intro ?? null},
      ${snapshot?.minutes_closing ?? null},
      ${actor.id}::uuid,
      'Protokoll archiviert'
    )
  `;

  await sql`
    UPDATE documents
    SET
      status='archived',
      archived_at=now(),
      archived_by=${actor.id}::uuid,
      notes='Freigegebenes Sitzungsprotokoll · archiviert.',
      updated_at=now()
    WHERE meeting_id=${meetingId}::uuid
      AND category='Protokoll'
      AND deleted_at IS NULL
  `;

  await writeAudit(actor.id,"meeting.minutes_archived","meeting",meetingId,{});
  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath("/dokumente");
  revalidatePath("/archiv");
  redirect(`/sitzungen/${meetingId}/protokoll?archived=1`);
}
