"use server";

import { createHash,randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { hasPermission,requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  deleteDocumentObject,
  isDocumentStorageConfigured,
  uploadDocumentObject,
} from "@/lib/document-storage";

const MAX_ATTACHMENT_SIZE=8*1024*1024;
const allowedUploads:Record<string,string[]>={
  pdf:["application/pdf"],
  doc:["application/msword","application/octet-stream"],
  docx:["application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/zip","application/octet-stream"],
  xls:["application/vnd.ms-excel","application/octet-stream"],
  xlsx:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/zip","application/octet-stream"],
  txt:["text/plain","application/octet-stream"],
  jpg:["image/jpeg"],
  jpeg:["image/jpeg"],
  png:["image/png"],
  webp:["image/webp"],
};

const guestAttendance=["present","absent","late","left_early"] as const;

function value(formData:FormData,key:string){
  return String(formData.get(key) ?? "").trim();
}

function extension(name:string){
  const pos=name.lastIndexOf(".");
  return pos>=0 ? name.slice(pos+1).toLowerCase() : "";
}

function safeName(name:string){
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g,"-")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"")
    .slice(0,120) || "anlage";
}

function v3Path(meetingId:string,returnTo:string,query?:string){
  const allowed=[
    `/sitzungen/${meetingId}`,
    `/sitzungen/${meetingId}/start`,
    `/sitzungen/${meetingId}/live`,
  ];
  const base=allowed.includes(returnTo) ? returnTo : allowed[0];
  return query ? `${base}?${query}` : base;
}

async function writeMeetingV3Audit(
  meetingId:string,
  actorId:string,
  action:string,
  entityType:string,
  entityId:string|null,
  afterData:Record<string,unknown>,
){
  const sql=getDb();
  if(!sql) return;
  await sql`
    INSERT INTO meeting_v3_audit_log (
      meeting_id,actor_user_id,action,entity_type,entity_id,after_data
    )
    VALUES (
      ${meetingId}::uuid,${actorId}::uuid,${action},${entityType},
      ${entityId || null}::uuid,${JSON.stringify(afterData)}::jsonb
    )
  `;
}

export async function addMeetingV3GuestAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const name=value(formData,"name");
  const organization=value(formData,"organization");
  const note=value(formData,"note");
  const returnTo=value(formData,"returnTo");

  if(!meetingId || !name) redirect(v3Path(meetingId,returnTo,"error=guest"));

  const rows=await sql`
    INSERT INTO meeting_v3_guests (
      meeting_id,name,organization,attendance,joined_at,note,created_by
    )
    SELECT
      m.id,${name},${organization || null},
      CASE WHEN m.lifecycle_state='live' THEN 'present' ELSE 'absent' END,
      CASE WHEN m.lifecycle_state='live' THEN now() ELSE NULL END,
      ${note || null},${actor.id}::uuid
    FROM meeting_v3_meetings m
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state IN ('preparation','ready','live')
    RETURNING id::text,attendance
  `;

  if(!rows.length) redirect(v3Path(meetingId,returnTo,"error=locked"));

  const guestId=String(rows[0].id);
  await writeMeetingV3Audit(meetingId,actor.id,"guest.created","guest",guestId,{
    name,organization:organization || null,attendance:String(rows[0].attendance),
  });
  await writeAudit(actor.id,"meeting_v3.guest_created","meeting_v3_guest",guestId,{meetingId,name});

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/start`);
  revalidatePath(`/sitzungen/${meetingId}/live`);
  redirect(v3Path(meetingId,returnTo,"guest=1"));
}

export async function updateMeetingV3GuestAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const guestId=value(formData,"guestId");
  const attendanceRaw=value(formData,"attendance");
  const attendance=(guestAttendance as readonly string[]).includes(attendanceRaw)
    ? attendanceRaw
    : null;
  const note=value(formData,"note");
  const returnTo=value(formData,"returnTo");

  if(!meetingId || !guestId || !attendance){
    redirect(v3Path(meetingId,returnTo,"error=guest"));
  }

  const rows=await sql`
    UPDATE meeting_v3_guests g
    SET
      attendance=${attendance},
      joined_at=CASE
        WHEN ${attendance} IN ('present','late') THEN COALESCE(g.joined_at,now())
        ELSE g.joined_at
      END,
      left_at=CASE
        WHEN ${attendance}='left_early' THEN COALESCE(g.left_at,now())
        ELSE NULL
      END,
      note=${note || null}
    FROM meeting_v3_meetings m
    WHERE g.id=${guestId}::uuid
      AND g.meeting_id=m.id
      AND m.id=${meetingId}::uuid
      AND m.lifecycle_state IN ('ready','live')
    RETURNING g.id::text,g.name
  `;

  if(!rows.length) redirect(v3Path(meetingId,returnTo,"error=locked"));

  await writeMeetingV3Audit(meetingId,actor.id,"guest.updated","guest",guestId,{
    attendance,note:note || null,
  });

  revalidatePath(`/sitzungen/${meetingId}/start`);
  revalidatePath(`/sitzungen/${meetingId}/live`);
  redirect(v3Path(meetingId,returnTo,"guest=1"));
}

export async function removeMeetingV3GuestAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const guestId=value(formData,"guestId");
  const returnTo=value(formData,"returnTo");

  const rows=await sql`
    DELETE FROM meeting_v3_guests g
    USING meeting_v3_meetings m
    WHERE g.id=${guestId}::uuid
      AND g.meeting_id=m.id
      AND m.id=${meetingId}::uuid
      AND m.lifecycle_state='preparation'
    RETURNING g.id::text,g.name
  `;

  if(!rows.length) redirect(v3Path(meetingId,returnTo,"error=locked"));

  await writeMeetingV3Audit(meetingId,actor.id,"guest.removed","guest",guestId,{
    name:String(rows[0].name),
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  redirect(v3Path(meetingId,returnTo,"guest_removed=1"));
}

export async function uploadMeetingV3AttachmentAction(formData:FormData){
  const actor=await requirePermission("meetings.write");
  if(!hasPermission(actor.roles,"documents.write")) redirect("/sitzungen?error=permission");
  const sql=getDb();
  if(!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const title=value(formData,"title");
  const attachmentKind=value(formData,"attachmentKind") || (agendaItemId ? "agenda_item" : "general");
  const returnTo=value(formData,"returnTo");
  const raw=formData.get("file");
  const file=raw instanceof File && raw.size>0 ? raw : null;

  if(!meetingId || !file) redirect(v3Path(meetingId,returnTo,"error=attachment"));
  if(file.size>MAX_ATTACHMENT_SIZE) redirect(v3Path(meetingId,returnTo,"error=attachment_size"));

  const ext=extension(file.name);
  const accepted=allowedUploads[ext];
  const mime=(file.type || "application/octet-stream").toLowerCase();
  if(!accepted || !accepted.includes(mime)){
    redirect(v3Path(meetingId,returnTo,"error=attachment_type"));
  }
  if(!isDocumentStorageConfigured()){
    redirect(v3Path(meetingId,returnTo,"error=storage"));
  }

  const valid=await sql`
    SELECT m.id::text
    FROM meeting_v3_meetings m
    WHERE m.id=${meetingId}::uuid
      AND m.lifecycle_state IN ('preparation','ready','live','closing')
      AND (
        ${agendaItemId || null}::uuid IS NULL
        OR EXISTS (
          SELECT 1 FROM meeting_v3_agenda_items ai
          WHERE ai.id=${agendaItemId || null}::uuid
            AND ai.meeting_id=m.id
        )
      )
    LIMIT 1
  `;
  if(!valid.length) redirect(v3Path(meetingId,returnTo,"error=locked"));

  const bytes=new Uint8Array(await file.arrayBuffer());
  const now=new Date();
  const year=now.getUTCFullYear();
  const month=String(now.getUTCMonth()+1).padStart(2,"0");
  const key=`documents/meeting-v3/${year}/${month}/${randomUUID()}-${safeName(file.name)}`;

  try{
    await uploadDocumentObject({key,body:bytes,contentType:mime});
  }catch{
    redirect(v3Path(meetingId,returnTo,"error=attachment_upload"));
  }

  try{
    const rows=await sql`
      WITH new_document AS (
        INSERT INTO documents (
          title,category,storage_type,storage_ref,mime_type,status,
          document_date,original_filename,file_size_bytes,
          uploaded_by,uploaded_at,checksum_sha256
        )
        VALUES (
          ${title || file.name},'Sitzungsanlage V3','upload',${key},${mime},'active',
          CURRENT_DATE,${file.name},${file.size},
          ${actor.id}::uuid,now(),
          ${createHash("sha256").update(bytes).digest("hex")}
        )
        RETURNING id,title
      ),
      new_attachment AS (
        INSERT INTO meeting_v3_attachments (
          meeting_id,agenda_item_id,document_id,title,attachment_kind,created_by
        )
        SELECT
          ${meetingId}::uuid,${agendaItemId || null}::uuid,d.id,d.title,
          ${attachmentKind},${actor.id}::uuid
        FROM new_document d
        RETURNING id::text,document_id::text,title
      )
      SELECT * FROM new_attachment
    `;

    if(!rows.length) throw new Error("V3_ATTACHMENT_INSERT_FAILED");

    const attachmentId=String(rows[0].id);
    await writeMeetingV3Audit(meetingId,actor.id,"attachment.uploaded","attachment",attachmentId,{
      agendaItemId:agendaItemId || null,
      documentId:String(rows[0].document_id),
      title:String(rows[0].title),
      originalFilename:file.name,
      size:file.size,
    });
    await writeAudit(actor.id,"meeting_v3.attachment_uploaded","meeting_v3_attachment",attachmentId,{
      meetingId,agendaItemId:agendaItemId || null,originalFilename:file.name,
    });
  }catch(error){
    try{await deleteDocumentObject(key);}catch{}
    throw error;
  }

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/live`);
  revalidatePath("/dokumente");
  redirect(v3Path(meetingId,returnTo,"attachment=1"));
}
