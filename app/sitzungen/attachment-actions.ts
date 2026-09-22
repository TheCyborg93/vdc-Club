"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  deleteDocumentObject,
  isDocumentStorageConfigured,
  uploadDocumentObject,
} from "@/lib/document-storage";

const MAX_ATTACHMENT_SIZE=8*1024*1024;
const allowed:Record<string,string[]>={
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

function value(formData:FormData,key:string) {
  return String(formData.get(key) ?? "").trim();
}

function ext(name:string) {
  const i=name.lastIndexOf(".");
  return i>=0 ? name.slice(i+1).toLowerCase() : "";
}

function redirectWith(base:string,key:string,value:string) {
  const separator=base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function safeName(name:string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g,"-")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"")
    .slice(0,120) || "anlage";
}

export async function uploadMeetingAttachmentAction(formData:FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const title=value(formData,"title");
  const returnTo=value(formData,"returnTo") || `/sitzungen/${meetingId}?top=${agendaItemId}`;
  const raw=formData.get("file");
  const file=raw instanceof File && raw.size>0 ? raw : null;

  if (!meetingId || !agendaItemId || !file) {
    redirect(redirectWith(returnTo,"error","attachment_missing"));
  }
  if (file.size>MAX_ATTACHMENT_SIZE) {
    redirect(redirectWith(returnTo,"error","attachment_size"));
  }

  const extension=ext(file.name);
  const allowedMime=allowed[extension];
  const mime=(file.type || "application/octet-stream").toLowerCase();
  if (!allowedMime || !allowedMime.includes(mime)) {
    redirect(redirectWith(returnTo,"error","attachment_type"));
  }
  if (!isDocumentStorageConfigured()) {
    redirect(redirectWith(returnTo,"error","storage"));
  }

  const valid=await sql`
    SELECT ai.title
    FROM agenda_items ai
    JOIN meetings m ON m.id=ai.meeting_id
    WHERE ai.id=${agendaItemId}::uuid
      AND ai.meeting_id=${meetingId}::uuid
      AND m.deleted_at IS NULL
      AND (
        m.status IN ('planned','running')
        OR (m.status='completed' AND m.minutes_status='draft')
      )
    LIMIT 1
  `;
  if (!valid.length) redirect(redirectWith(returnTo,"error","meeting_locked"));

  const bytes=new Uint8Array(await file.arrayBuffer());
  const now=new Date();
  const year=now.getUTCFullYear();
  const month=String(now.getUTCMonth()+1).padStart(2,"0");
  const key=`documents/meeting-attachments/${year}/${month}/${randomUUID()}-${safeName(file.name)}`;

  try {
    await uploadDocumentObject({key,body:bytes,contentType:mime});
  } catch {
    redirect(redirectWith(returnTo,"error","attachment_upload"));
  }

  try {
    const rows=await sql`
      INSERT INTO documents(
        title,category,storage_type,storage_ref,mime_type,status,
        document_date,meeting_id,agenda_item_id,
        original_filename,file_size_bytes,uploaded_by,uploaded_at,checksum_sha256
      )
      VALUES(
        ${title || file.name},
        'Sitzungsanlage',
        'upload',
        ${key},
        ${mime},
        'active',
        CURRENT_DATE,
        ${meetingId}::uuid,
        ${agendaItemId}::uuid,
        ${file.name},
        ${file.size},
        ${actor.id}::uuid,
        now(),
        ${createHash("sha256").update(bytes).digest("hex")}
      )
      RETURNING id::text
    `;

    await writeAudit(actor.id,"meeting.attachment_uploaded","document",String(rows[0]?.id ?? ""),{
      meetingId,agendaItemId,originalFilename:file.name,
    });
  } catch(error) {
    try { await deleteDocumentObject(key); } catch {}
    throw error;
  }

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath("/dokumente");
  redirect(redirectWith(returnTo,"attachment","1"));
}

export async function uploadMeetingGeneralAttachmentAction(formData:FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const title=value(formData,"title");
  const returnTo=value(formData,"returnTo") || `/sitzungen/${meetingId}`;
  const raw=formData.get("file");
  const file=raw instanceof File && raw.size>0 ? raw : null;

  if (!meetingId || !file) redirect(`${returnTo}?error=attachment_missing`);
  if (file.size>MAX_ATTACHMENT_SIZE) redirect(`${returnTo}?error=attachment_size`);

  const extension=ext(file.name);
  const allowedMime=allowed[extension];
  const mime=(file.type || "application/octet-stream").toLowerCase();
  if (!allowedMime || !allowedMime.includes(mime)) {
    redirect(`${returnTo}?error=attachment_type`);
  }
  if (!isDocumentStorageConfigured()) redirect(`${returnTo}?error=storage`);

  const valid=await sql`
    SELECT id::text
    FROM meetings
    WHERE id=${meetingId}::uuid
      AND deleted_at IS NULL
      AND (
        status IN ('planned','running')
        OR (status='completed' AND minutes_status='draft')
      )
    LIMIT 1
  `;
  if (!valid.length) redirect(`${returnTo}?error=meeting_locked`);

  const bytes=new Uint8Array(await file.arrayBuffer());
  const now=new Date();
  const year=now.getUTCFullYear();
  const month=String(now.getUTCMonth()+1).padStart(2,"0");
  const key=`documents/meeting-attachments/${year}/${month}/${randomUUID()}-${safeName(file.name)}`;

  try {
    await uploadDocumentObject({key,body:bytes,contentType:mime});
  } catch {
    redirect(`${returnTo}?error=attachment_upload`);
  }

  try {
    const rows=await sql`
      INSERT INTO documents(
        title,category,storage_type,storage_ref,mime_type,status,
        document_date,meeting_id,agenda_item_id,
        original_filename,file_size_bytes,uploaded_by,uploaded_at,checksum_sha256
      )
      VALUES(
        ${title || file.name},
        'Sitzungsanlage',
        'upload',
        ${key},
        ${mime},
        'active',
        CURRENT_DATE,
        ${meetingId}::uuid,
        NULL,
        ${file.name},
        ${file.size},
        ${actor.id}::uuid,
        now(),
        ${createHash("sha256").update(bytes).digest("hex")}
      )
      RETURNING id::text
    `;

    await writeAudit(actor.id,"meeting.general_attachment_uploaded","document",String(rows[0]?.id ?? ""),{
      meetingId,originalFilename:file.name,
    });
  } catch(error) {
    try { await deleteDocumentObject(key); } catch {}
    throw error;
  }

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath(`/sitzungen/${meetingId}/korrektur`);
  revalidatePath("/dokumente");
  redirect(`${returnTo}?attachment=1`);
}

export async function removeMeetingGeneralAttachmentAction(formData:FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const documentId=value(formData,"documentId");
  const returnTo=value(formData,"returnTo") || `/sitzungen/${meetingId}`;

  const rows=await sql`
    UPDATE documents d
    SET
      deleted_at=now(),
      deleted_by=${actor.id}::uuid,
      delete_reason='Allgemeine Sitzungsanlage entfernt.'
    FROM meetings m
    WHERE d.id=${documentId}::uuid
      AND d.meeting_id=${meetingId}::uuid
      AND d.agenda_item_id IS NULL
      AND d.category='Sitzungsanlage'
      AND d.deleted_at IS NULL
      AND m.id=d.meeting_id
      AND m.deleted_at IS NULL
      AND (
        m.status IN ('planned','running')
        OR (m.status='completed' AND m.minutes_status='draft')
      )
    RETURNING d.title
  `;

  if (!rows.length) redirect(`${returnTo}?error=attachment_missing`);

  await writeAudit(actor.id,"meeting.general_attachment_removed","document",documentId,{
    meetingId,title:String(rows[0].title),
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath(`/sitzungen/${meetingId}/korrektur`);
  revalidatePath("/dokumente");
  redirect(`${returnTo}?attachment_deleted=1`);
}

export async function removeMeetingAttachmentAction(formData:FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/sitzungen?error=database");

  const meetingId=value(formData,"meetingId");
  const agendaItemId=value(formData,"agendaItemId");
  const documentId=value(formData,"documentId");
  const returnTo=value(formData,"returnTo") || `/sitzungen/${meetingId}?top=${agendaItemId}`;

  const rows=await sql`
    UPDATE documents
    SET
      deleted_at=now(),
      deleted_by=${actor.id}::uuid,
      delete_reason='Anlage aus Vorstandssitzung entfernt.'
    WHERE id=${documentId}::uuid
      AND meeting_id=${meetingId}::uuid
      AND agenda_item_id=${agendaItemId}::uuid
      AND category='Sitzungsanlage'
      AND deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM meetings m
        WHERE m.id=documents.meeting_id
          AND m.deleted_at IS NULL
          AND (
            m.status IN ('planned','running')
            OR (m.status='completed' AND m.minutes_status='draft')
          )
      )
    RETURNING title
  `;

  if (!rows.length) redirect(redirectWith(returnTo,"error","attachment_missing"));

  await writeAudit(actor.id,"meeting.attachment_removed","document",documentId,{
    meetingId,agendaItemId,title:String(rows[0].title),
  });

  revalidatePath(`/sitzungen/${meetingId}`);
  revalidatePath(`/sitzungen/${meetingId}/protokoll`);
  revalidatePath("/dokumente");
  redirect(redirectWith(returnTo,"attachment_deleted","1"));
}
