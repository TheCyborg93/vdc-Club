"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { meetingV3AgendaTypes,meetingV3Types } from "@/lib/meeting-v3";

function value(formData:FormData,key:string){
  return String(formData.get(key) ?? "").trim();
}

function templatesPath(query?:string){
  return `/sitzungen/vorlagen${query ? `?${query}` : ""}`;
}

export async function createMeetingV3TemplateAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const name=value(formData,"name");
  const description=value(formData,"description");
  const typeRaw=value(formData,"meetingType");
  const meetingType=(meetingV3Types as readonly string[]).includes(typeRaw) ? typeRaw : "board";
  const makeDefault=value(formData,"makeDefault")==="yes";
  if(!name) redirect(templatesPath("error=missing"));

  if(makeDefault){
    await sql`
      UPDATE meeting_v3_templates
      SET is_default=false,updated_at=now()
      WHERE meeting_type=${meetingType}
    `;
  }

  await sql`
    INSERT INTO meeting_v3_templates (
      name,meeting_type,description,is_default,is_active,created_by
    )
    VALUES (
      ${name},${meetingType},${description || null},${makeDefault},true,${actor.id}::uuid
    )
  `;

  revalidatePath("/sitzungen/vorlagen");
  revalidatePath("/sitzungen");
  redirect(templatesPath("created=1"));
}

export async function setMeetingV3TemplateDefaultAction(formData:FormData){
  await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");
  const templateId=value(formData,"templateId");
  if(!templateId) redirect(templatesPath("error=missing"));

  const rows=await sql`
    SELECT id::text,meeting_type
    FROM meeting_v3_templates
    WHERE id=${templateId}::uuid
      AND is_active=true
    LIMIT 1
  `;
  if(!rows[0]) redirect(templatesPath("error=missing"));

  await sql`
    UPDATE meeting_v3_templates
    SET is_default=(id=${templateId}::uuid),updated_at=now()
    WHERE meeting_type=${String(rows[0].meeting_type)}
  `;

  revalidatePath("/sitzungen/vorlagen");
  revalidatePath("/sitzungen");
  redirect(templatesPath("saved=1"));
}

export async function toggleMeetingV3TemplateActiveAction(formData:FormData){
  await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");
  const templateId=value(formData,"templateId");
  if(!templateId) redirect(templatesPath("error=missing"));

  await sql`
    UPDATE meeting_v3_templates
    SET
      is_active=NOT is_active,
      is_default=CASE WHEN is_active THEN false ELSE is_default END,
      updated_at=now()
    WHERE id=${templateId}::uuid
  `;

  revalidatePath("/sitzungen/vorlagen");
  revalidatePath("/sitzungen");
  redirect(templatesPath("saved=1"));
}

export async function addMeetingV3TemplateItemAction(formData:FormData){
  await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const templateId=value(formData,"templateId");
  const title=value(formData,"title");
  const description=value(formData,"description");
  const typeRaw=value(formData,"agendaType");
  const agendaType=(meetingV3AgendaTypes as readonly string[]).includes(typeRaw) ? typeRaw : "consultation";
  const minutesRaw=value(formData,"estimatedMinutes");
  const estimatedMinutes=minutesRaw ? Number(minutesRaw) : null;
  const isRequired=value(formData,"isRequired")==="yes";

  if(!templateId || !title || (estimatedMinutes!==null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes<=0))){
    redirect(templatesPath("error=missing"));
  }

  await sql`
    INSERT INTO meeting_v3_template_items (
      template_id,position,title,agenda_type,description,estimated_minutes,is_required
    )
    SELECT
      t.id,
      COALESCE((SELECT MAX(i.position) FROM meeting_v3_template_items i WHERE i.template_id=t.id),0)+1,
      ${title},${agendaType},${description || null},${estimatedMinutes},${isRequired}
    FROM meeting_v3_templates t
    WHERE t.id=${templateId}::uuid
  `;

  revalidatePath("/sitzungen/vorlagen");
  redirect(templatesPath("saved=1"));
}

export async function deleteMeetingV3TemplateItemAction(formData:FormData){
  await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const templateId=value(formData,"templateId");
  const itemId=value(formData,"itemId");
  if(!templateId || !itemId) redirect(templatesPath("error=missing"));

  const rows=await sql`
    DELETE FROM meeting_v3_template_items
    WHERE id=${itemId}::uuid
      AND template_id=${templateId}::uuid
    RETURNING position
  `;

  if(rows[0]){
    await sql`
      UPDATE meeting_v3_template_items
      SET position=position-1
      WHERE template_id=${templateId}::uuid
        AND position>${Number(rows[0].position)}
    `;
  }

  revalidatePath("/sitzungen/vorlagen");
  redirect(templatesPath("saved=1"));
}
