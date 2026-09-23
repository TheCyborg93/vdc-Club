"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { hasPermission,requirePermission } from "@/lib/permissions";
import {
  meetingV3AgendaTypes,
  type MeetingV3AgendaType,
} from "@/lib/meeting-v3";

const voteMethods=["open","show_of_hands","roll_call","secret"] as const;
const votes=["yes","no","abstain"] as const;

function value(formData:FormData,key:string){
  return String(formData.get(key) ?? "").trim();
}

function livePath(meetingId:string,query?:string){
  return `/sitzungen-neu/${meetingId}/live${query ? `?${query}` : ""}`;
}

function positiveInteger(raw:string){
  if(!/^\d+$/.test(raw)) return null;
  const parsed=Number(raw);
  return Number.isSafeInteger(parsed) && parsed>=0 ? parsed : null;
}

async function writeMeetingV3Audit(
  meetingId:string,
  actorUserId:string,
  action:string,
  entityType:string,
  entityId:string|null,
  afterData:Record<string,unknown>={},
  reason?:string,
){
  const sql=getDb();
  if(!sql) return;
  await sql`
    INSERT INTO meeting_v3_audit_log (
      meeting_id,actor_user_id,action,entity_type,entity_id,after_data,reason
    )
    VALUES (
      ${meetingId}::uuid,${actorUserId}::uuid,${action},${entityType},
      ${entityId || null}::uuid,${JSON.stringify(afterData)}::jsonb,${reason || null}
    )
  `;
}

export async function addSpontaneousMeetingV3AgendaAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen-neu?error=database");

  const meetingId=value(formData,"meetingId");
  const title=value(formData,"title");
  const description=value(formData,"description");
  const reason=value(formData,"spontaneousReason");
  const typeRaw=value(formData,"agendaType");
  const agendaType=(meetingV3AgendaTypes as readonly string[]).includes(typeRaw)
    ? typeRaw as MeetingV3AgendaType
    : "consultation";

  if(!meetingId || !title || !reason) redirect(livePath(meetingId,"error=spontaneous"));

  const rows=await sql`
    INSERT INTO meeting_v3_agenda_items (
      meeting_id,position,title,agenda_type,description,status,
      spontaneous,spontaneous_reason,announced_with_invitation,
      created_by,updated_by
    )
    SELECT
      m.id,
      COALESCE((SELECT max(ai.position) FROM meeting_v3_agenda_items ai WHERE ai.meeting_id=m.id),0)+1,
      ${title},${agendaType},${description || null},'open',
      true,${reason},false,${actor.id}::uuid,${actor.id}::uuid
    FROM meeting_v3_meetings m
    WHERE m.id=${meetingId}::uuid AND m.lifecycle_state='live'
    RETURNING id::text,position
  `;

  if(!rows.length) redirect(livePath(meetingId,"error=locked"));

  const agendaItemId=String(rows[0].id);
  await writeMeetingV3Audit(meetingId,actor.id,"agenda.spontaneous_created","agenda_item",agendaItemId,{
    title,agendaType,position:Number(rows[0].position),reason,
  });

  revalidatePath(livePath(meetingId));
  redirect(livePath(meetingId,"spontaneous=1"));
}

export async function addMeetingV3VoteExclusionAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen-neu?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const memberId=value(formData,"memberId");
  const reason=value(formData,"reason");

  if(!meetingId || !agendaItemId || !memberId || !reason){
    redirect(livePath(meetingId,"error=exclusion"));
  }

  const rows=await sql`
    INSERT INTO meeting_v3_vote_exclusions (
      agenda_item_id,member_id,reason,created_by
    )
    SELECT ai.id,p.member_id,${reason},${actor.id}::uuid
    FROM meeting_v3_agenda_items ai
    JOIN meeting_v3_meetings m ON m.id=ai.meeting_id
    JOIN meeting_v3_participants p ON p.meeting_id=m.id
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='live'
      AND ai.id=${agendaItemId}::uuid
      AND ai.status='active'
      AND p.member_id=${memberId}::uuid
      AND p.attendance='present'
      AND p.voting_eligible=true
      AND NOT EXISTS (
        SELECT 1 FROM meeting_v3_vote_exclusions existing
        WHERE existing.agenda_item_id=ai.id
          AND existing.member_id=p.member_id
          AND existing.ended_at IS NULL
      )
    RETURNING id::text
  `;

  if(!rows.length) redirect(livePath(meetingId,"error=exclusion"));

  const exclusionId=String(rows[0].id);
  await writeMeetingV3Audit(meetingId,actor.id,"vote_exclusion.created","vote_exclusion",exclusionId,{
    agendaItemId,memberId,reason,
  });

  revalidatePath(livePath(meetingId));
  redirect(livePath(meetingId,"exclusion=1"));
}

export async function endMeetingV3VoteExclusionAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen-neu?error=database");

  const meetingId=value(formData,"meetingId");
  const exclusionId=value(formData,"exclusionId");

  const rows=await sql`
    UPDATE meeting_v3_vote_exclusions e
    SET ended_at=now()
    FROM meeting_v3_agenda_items ai,meeting_v3_meetings m
    WHERE e.id=${exclusionId}::uuid
      AND e.agenda_item_id=ai.id
      AND ai.meeting_id=m.id
      AND m.id=${meetingId}::uuid
      AND m.lifecycle_state='live'
      AND e.ended_at IS NULL
    RETURNING e.id::text,e.member_id::text
  `;

  if(!rows.length) redirect(livePath(meetingId,"error=exclusion"));

  await writeMeetingV3Audit(meetingId,actor.id,"vote_exclusion.ended","vote_exclusion",exclusionId,{
    memberId:rows[0].member_id ? String(rows[0].member_id) : null,
  });

  revalidatePath(livePath(meetingId));
  redirect(livePath(meetingId,"exclusion=1"));
}

export async function createMeetingV3ResolutionAction(formData:FormData){
  const actor=await requirePermission("resolutions.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen-neu?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const title=value(formData,"title");
  const decisionText=value(formData,"decisionText");
  const methodRaw=value(formData,"voteMethod");
  const voteMethod=(voteMethods as readonly string[]).includes(methodRaw)
    ? methodRaw
    : "show_of_hands";

  if(!meetingId || !agendaItemId || !title || !decisionText){
    redirect(livePath(meetingId,"error=resolution"));
  }

  const eligibleRows=await sql`
    SELECT
      p.member_id::text,m.first_name,m.last_name
    FROM meeting_v3_participants p
    JOIN members m ON m.id=p.member_id
    JOIN meeting_v3_meetings mt ON mt.id=p.meeting_id
    JOIN meeting_v3_agenda_items ai ON ai.meeting_id=mt.id
    WHERE mt.id=${meetingId}::uuid
      AND mt.lifecycle_state='live'
      AND ai.id=${agendaItemId}::uuid
      AND ai.status='active'
      AND p.attendance='present'
      AND p.voting_eligible=true
      AND NOT EXISTS (
        SELECT 1 FROM meeting_v3_vote_exclusions e
        WHERE e.agenda_item_id=ai.id
          AND e.member_id=p.member_id
          AND e.ended_at IS NULL
      )
    ORDER BY m.last_name,m.first_name
  `;

  const eligibleVoters=eligibleRows.length;
  if(eligibleVoters===0) redirect(livePath(meetingId,"error=no_voters"));

  let yes=0;
  let no=0;
  let abstain=0;
  const namedVotes:Array<{memberId:string;vote:"yes"|"no"|"abstain"}>=[];

  if(voteMethod==="roll_call"){
    for(const person of eligibleRows){
      const memberId=String(person.member_id);
      const raw=value(formData,`vote_${memberId}`);
      if(!(votes as readonly string[]).includes(raw)){
        redirect(livePath(meetingId,"error=named_votes"));
      }
      const vote=raw as "yes"|"no"|"abstain";
      namedVotes.push({memberId,vote});
      if(vote==="yes") yes+=1;
      else if(vote==="no") no+=1;
      else abstain+=1;
    }
  }else{
    const yesRaw=positiveInteger(value(formData,"votesYes"));
    const noRaw=positiveInteger(value(formData,"votesNo"));
    const abstainRaw=positiveInteger(value(formData,"votesAbstain"));
    if(yesRaw==null || noRaw==null || abstainRaw==null){
      redirect(livePath(meetingId,"error=votes"));
    }
    yes=yesRaw;
    no=noRaw;
    abstain=abstainRaw;
  }

  if(yes+no+abstain!==eligibleVoters){
    redirect(livePath(meetingId,"error=vote_sum"));
  }

  const outcome=yes>no ? "accepted" : "rejected";
  const excludedRows=await sql`
    SELECT count(*)::int AS count
    FROM meeting_v3_vote_exclusions e
    JOIN meeting_v3_agenda_items ai ON ai.id=e.agenda_item_id
    WHERE ai.meeting_id=${meetingId}::uuid
      AND ai.id=${agendaItemId}::uuid
      AND e.ended_at IS NULL
  `;
  const excludedVoters=Number(excludedRows[0]?.count ?? 0);
  const year=new Intl.DateTimeFormat("de-DE",{year:"numeric",timeZone:"Europe/Berlin"}).format(new Date());

  const rows=await sql`
    WITH lock_row AS (
      SELECT pg_advisory_xact_lock(hashtext(${`meeting-v3-resolution-${year}`}))
    ),
    next_number AS (
      SELECT
        COALESCE(MAX(
          CASE
            WHEN r.resolution_number ~ ${`^${year}-[0-9]+$`}
            THEN split_part(r.resolution_number,'-',2)::int
            ELSE NULL
          END
        ),0)+1 AS number
      FROM meeting_v3_resolutions r,lock_row
    )
    INSERT INTO meeting_v3_resolutions (
      meeting_id,agenda_item_id,resolution_number,title,decision_text,
      vote_method,eligible_voters,excluded_voters,
      votes_yes,votes_no,votes_abstain,decision_outcome,
      implementation_status,created_by
    )
    SELECT
      m.id,ai.id,
      ${year} || '-' || lpad(nn.number::text,3,'0'),
      ${title},${decisionText},${voteMethod},
      ${eligibleVoters},${excludedVoters},
      ${yes},${no},${abstain},${outcome},
      'open',${actor.id}::uuid
    FROM meeting_v3_meetings m
    JOIN meeting_v3_agenda_items ai ON ai.meeting_id=m.id
    CROSS JOIN next_number nn
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state='live'
      AND ai.id=${agendaItemId}::uuid
      AND ai.status='active'
    RETURNING id::text,resolution_number
  `;

  if(!rows.length) redirect(livePath(meetingId,"error=resolution"));

  const resolutionId=String(rows[0].id);
  const resolutionNumber=String(rows[0].resolution_number);

  if(voteMethod==="roll_call"){
    for(const named of namedVotes){
      await sql`
        INSERT INTO meeting_v3_named_votes (resolution_id,member_id,vote)
        VALUES (${resolutionId}::uuid,${named.memberId}::uuid,${named.vote})
      `;
    }
  }

  const createTask=value(formData,"createTask")==="yes";
  if(createTask && outcome==="accepted"){
    if(!hasPermission(actor.roles,"tasks.write")){
      redirect(livePath(meetingId,"error=task_permission"));
    }
    const taskTitle=value(formData,"taskTitle") || `Beschluss umsetzen: ${title}`;
    const taskDescription=value(formData,"taskDescription") || decisionText;
    const ownerMemberId=value(formData,"ownerMemberId");
    const dueDate=value(formData,"dueDate");

    await sql`
      INSERT INTO tasks (
        title,description,category,status,priority,
        due_date,owner_member_id,source_type,source_id
      )
      VALUES (
        ${taskTitle},${taskDescription || null},'Beschluss',
        'open','medium',${dueDate || null}::date,${ownerMemberId || null}::uuid,
        'meeting_v3_resolution',${resolutionId}::uuid
      )
    `;

    await sql`
      UPDATE meeting_v3_resolutions
      SET implementation_status='in_progress'
      WHERE id=${resolutionId}::uuid
    `;
  }

  await writeMeetingV3Audit(meetingId,actor.id,"resolution.created","resolution",resolutionId,{
    resolutionNumber,title,voteMethod,eligibleVoters,excludedVoters,yes,no,abstain,outcome,
    taskCreated:createTask && outcome==="accepted",
  });
  await writeAudit(actor.id,"meeting_v3.resolution_created","meeting_v3_resolution",resolutionId,{
    meetingId,agendaItemId,resolutionNumber,outcome,
  });

  revalidatePath(livePath(meetingId));
  revalidatePath("/aufgaben");
  redirect(livePath(meetingId,"resolution=1"));
}
