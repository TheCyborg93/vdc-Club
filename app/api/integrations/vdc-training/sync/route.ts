import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { bearerToken, secureSecretEqual } from "@/lib/integration-token";

export const runtime = "nodejs";

type AttendeePayload = {
  externalId?: string | number;
  fullName?: string;
  attendance?: "present" | "absent" | "excused";
};

type TrainingDayPayload = {
  externalId: string | number;
  startsAt: string;
  status?: string | null;
  players?: number;
  attendees?: AttendeePayload[];
};

type PlayerPayload = {
  externalId: string | number;
  fullName: string;
  displayName?: string | null;
};

type SyncPayload = {
  source?: string;
  trainingDays?: TrainingDayPayload[];
  players?: PlayerPayload[];
};

function sessionStatus(value: string | null | undefined) {
  const normalized=String(value ?? "").toLowerCase();
  if (["cancelled","canceled","abgesagt"].includes(normalized)) return "cancelled";
  if (["completed","complete","done","finished","closed","beendet"].includes(normalized)) return "completed";
  return "planned";
}

export async function POST(request: Request) {
  const expected = process.env.VDC_TRAINING_SYNC_TOKEN;
  const provided = bearerToken(request);

  if (!expected) return NextResponse.json({ error: "Training sync token is not configured." }, { status: 503 });
  if (!provided || !secureSecretEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const sql = getDb();
  if (!sql) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  let payload: SyncPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (payload.source && payload.source !== "vdc_training") {
    return NextResponse.json({ error: "Invalid source." }, { status: 400 });
  }

  const days = Array.isArray(payload.trainingDays) ? payload.trainingDays : [];
  const players = Array.isArray(payload.players) ? payload.players : [];
  let attendanceDays=0;

  try {
    // Players first so training-day attendees can be resolved through the stable source id.
    for (const player of players) {
      if (player.externalId === undefined || !player.fullName.trim()) continue;
      const externalId = String(player.externalId);
      const fullName = player.fullName.trim();

      await sql`
        INSERT INTO integration_entity_links (
          integration_key,entity_type,external_id,local_id,metadata,last_synced_at
        )
        SELECT
          'vdc_training','player',${externalId},m.id,
          jsonb_build_object(
            'display_name',${player.displayName ?? null},
            'source_name',${fullName}
          ),
          now()
        FROM members m
        WHERE lower(trim(m.first_name || ' ' || m.last_name))=lower(${fullName})
        ON CONFLICT (integration_key,entity_type,external_id)
        DO UPDATE SET
          local_id=EXCLUDED.local_id,
          metadata=EXCLUDED.metadata,
          last_synced_at=now()
      `;
    }

    for (const day of days) {
      if (day.externalId === undefined || !day.startsAt) continue;

      const externalId=String(day.externalId);
      const status=sessionStatus(day.status);
      const attendees=Array.isArray(day.attendees) ? day.attendees : null;
      const playerCount=attendees
        ? attendees.filter((attendee)=>attendee.attendance !== "absent").length
        : Number.isFinite(Number(day.players))
          ? Math.max(0,Number(day.players))
          : 0;

      let sessionRows = await sql`
        UPDATE training_sessions
        SET
          scheduled_at=${day.startsAt}::timestamptz,
          status=${status},
          source='vdc_training',
          updated_at=now()
        WHERE source='vdc_training'
          AND external_id=${externalId}
        RETURNING id::text,event_id::text
      `;

      if (!sessionRows.length) {
        sessionRows=await sql`
          INSERT INTO training_sessions (
            scheduled_at,status,source,external_id,notes
          )
          VALUES (
            ${day.startsAt}::timestamptz,
            ${status},
            'vdc_training',
            ${externalId},
            ${day.status ?? null}
          )
          ON CONFLICT (scheduled_at)
          DO UPDATE SET
            status=EXCLUDED.status,
            source='vdc_training',
            external_id=COALESCE(training_sessions.external_id,EXCLUDED.external_id),
            notes=COALESCE(EXCLUDED.notes,training_sessions.notes),
            updated_at=now()
          RETURNING id::text,event_id::text
        `;
      }

      const sessionId=String(sessionRows[0]?.id ?? "");
      if (!sessionId) continue;

      let eventId=sessionRows[0]?.event_id ? String(sessionRows[0].event_id) : "";

      const description=[
        day.status ? `Status ${day.status}` : null,
        attendees ? `${playerCount} anwesend` : `${playerCount} Spieler`,
      ].filter(Boolean).join(" · ");

      if (eventId) {
        await sql`
          UPDATE club_events
          SET
            title=${status==="cancelled" ? "Vereinstraining · ABGESAGT" : "Vereinstraining"},
            event_type='training',
            starts_at=${day.startsAt}::timestamptz,
            ends_at=NULL,
            description=${description},
            updated_at=now()
          WHERE id=${eventId}::uuid
        `;
      } else {
        const eventRows=await sql`
          INSERT INTO club_events (
            title,event_type,starts_at,ends_at,source,external_id,description
          )
          VALUES (
            ${status==="cancelled" ? "Vereinstraining · ABGESAGT" : "Vereinstraining"},
            'training',
            ${day.startsAt}::timestamptz,
            NULL,
            'vdc_training',
            ${externalId},
            ${description}
          )
          ON CONFLICT (source,external_id) WHERE external_id IS NOT NULL
          DO UPDATE SET
            title=EXCLUDED.title,
            starts_at=EXCLUDED.starts_at,
            ends_at=NULL,
            description=EXCLUDED.description,
            updated_at=now()
          RETURNING id::text
        `;
        eventId=String(eventRows[0]?.id ?? "");
        if (eventId) {
          await sql`
            UPDATE training_sessions
            SET event_id=${eventId}::uuid
            WHERE id=${sessionId}::uuid
          `;
        }
      }

      if (eventId) {
        await sql`
          INSERT INTO integration_entity_links (
            integration_key,entity_type,external_id,local_id,metadata,last_synced_at
          )
          VALUES (
            'vdc_training','training_day',${externalId},${eventId}::uuid,
            jsonb_build_object(
              'status',${day.status ?? null},
              'players',${playerCount},
              'attendance_provided',${Boolean(attendees)}
            ),
            now()
          )
          ON CONFLICT (integration_key,entity_type,external_id)
          DO UPDATE SET
            local_id=EXCLUDED.local_id,
            metadata=EXCLUDED.metadata,
            last_synced_at=now()
        `;
      }

      if (attendees && status !== "cancelled") {
        const resolved = new Map<string,"present" | "absent" | "excused">();

        for (const attendee of attendees) {
          let memberId="";

          if (attendee.externalId !== undefined) {
            const linkRows=await sql`
              SELECT local_id::text
              FROM integration_entity_links
              WHERE integration_key='vdc_training'
                AND entity_type='player'
                AND external_id=${String(attendee.externalId)}
              LIMIT 1
            `;
            memberId=linkRows[0]?.local_id ? String(linkRows[0].local_id) : "";
          }

          if (!memberId && attendee.fullName?.trim()) {
            const memberRows=await sql`
              SELECT id::text
              FROM members
              WHERE lower(trim(first_name || ' ' || last_name))
                    = lower(${attendee.fullName.trim()})
              LIMIT 1
            `;
            memberId=memberRows[0]?.id ? String(memberRows[0].id) : "";
          }

          if (memberId) {
            const attendance = attendee.attendance === "excused"
              ? "excused"
              : attendee.attendance === "absent"
                ? "absent"
                : "present";
            resolved.set(memberId,attendance);
          }
        }

        const eligibleMembers=await sql`
          SELECT id::text
          FROM members
          WHERE status IN ('active','passive')
            AND (join_date IS NULL OR join_date <= (${day.startsAt}::timestamptz AT TIME ZONE 'Europe/Berlin')::date)
            AND (leave_date IS NULL OR leave_date >= (${day.startsAt}::timestamptz AT TIME ZONE 'Europe/Berlin')::date)
        `;

        const rows=eligibleMembers.map((member)=>({
          memberId:String(member.id),
          attendance:resolved.get(String(member.id)) ?? "absent",
        }));

        await sql`DELETE FROM training_attendance WHERE session_id=${sessionId}::uuid`;

        if (rows.length) {
          await sql`
            INSERT INTO training_attendance (session_id,member_id,attendance)
            SELECT
              ${sessionId}::uuid,
              (entry->>'memberId')::uuid,
              entry->>'attendance'
            FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) AS entry
          `;
        }

        await sql`
          UPDATE training_sessions
          SET
            status='completed',
            attendance_recorded_at=now(),
            completed_at=COALESCE(completed_at,now())
          WHERE id=${sessionId}::uuid
        `;

        attendanceDays += 1;
      }
    }

    await sql`
      UPDATE integration_connections
      SET status='connected',last_sync_at=now(),last_error=NULL,updated_at=now()
      WHERE integration_key='vdc_training'
    `;

    await sql`
      INSERT INTO integration_sync_runs (integration_key,direction,status,summary)
      VALUES (
        'vdc_training','inbound','success',
        jsonb_build_object(
          'training_days',${days.length},
          'players',${players.length},
          'attendance_days',${attendanceDays}
        )
      )
    `;

    return NextResponse.json({
      ok:true,
      trainingDays:days.length,
      players:players.length,
      attendanceDays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0,500) : "Unknown sync error";

    await sql`
      UPDATE integration_connections
      SET status='error',last_error=${message},updated_at=now()
      WHERE integration_key='vdc_training'
    `;
    await sql`
      INSERT INTO integration_sync_runs (integration_key,direction,status,error_text)
      VALUES ('vdc_training','inbound','error',${message})
    `;

    return NextResponse.json({ error:"Sync failed." },{ status:500 });
  }
}
