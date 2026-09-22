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

const MAX_FILE_SIZE=4*1024*1024;

const allowedUploads: Record<string,string[]> = {
  pdf:["application/pdf"],
  doc:["application/msword","application/octet-stream"],
  docx:["application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/zip","application/octet-stream"],
  xls:["application/vnd.ms-excel","application/octet-stream"],
  xlsx:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/zip","application/octet-stream"],
  ppt:["application/vnd.ms-powerpoint","application/octet-stream"],
  pptx:["application/vnd.openxmlformats-officedocument.presentationml.presentation","application/zip","application/octet-stream"],
  odt:["application/vnd.oasis.opendocument.text","application/zip","application/octet-stream"],
  ods:["application/vnd.oasis.opendocument.spreadsheet","application/zip","application/octet-stream"],
  txt:["text/plain","application/octet-stream"],
  jpg:["image/jpeg"],
  jpeg:["image/jpeg"],
  png:["image/png"],
  webp:["image/webp"],
};

function value(formData: FormData,key:string) {
  return String(formData.get(key) ?? "").trim();
}

function revalidateDocuments() {
  revalidatePath("/dokumente");
  revalidatePath("/archiv");
  revalidatePath("/");
}

function extension(name:string) {
  const pos=name.lastIndexOf(".");
  return pos>=0 ? name.slice(pos+1).toLowerCase() : "";
}

function sanitizeFilename(name:string) {
  const cleaned=name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g,"-")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"");
  return cleaned.slice(0,120) || "dokument";
}

function validateUpload(file:File) {
  if (file.size<=0) return "empty";
  if (file.size>MAX_FILE_SIZE) return "size";

  const ext=extension(file.name);
  const allowed=allowedUploads[ext];
  if (!allowed) return "type";

  const mime=(file.type || "application/octet-stream").toLowerCase();
  if (!allowed.includes(mime)) return "type";
  return null;
}

export async function createDocumentAction(formData: FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/dokumente?error=database");

  const title=value(formData,"title");
  const category=value(formData,"category");
  const storageRef=value(formData,"storageRef");
  const documentDate=value(formData,"documentDate");
  const validUntil=value(formData,"validUntil");
  const reviewOn=value(formData,"reviewOn");
  const notes=value(formData,"notes");
  const meetingId=value(formData,"meetingId");
  const resolutionId=value(formData,"resolutionId");
  const memberId=value(formData,"memberId");
  const financeEntryId=value(formData,"financeEntryId");
  const sponsorId=value(formData,"sponsorId");

  const rawFile=formData.get("file");
  const file=rawFile instanceof File && rawFile.size>0 ? rawFile : null;

  if (!title || !category) redirect("/dokumente?error=missing");
  if (file && storageRef) redirect("/dokumente?error=source");

  if (storageRef) {
    try {
      const url=new URL(storageRef);
      if (!["http:","https:"].includes(url.protocol)) {
        redirect("/dokumente?error=invalid");
      }
    } catch {
      redirect("/dokumente?error=invalid");
    }
  }

  let storageType=storageRef ? "link" : "record";
  let storedRef:string | null=storageRef || null;
  let mimeType:string | null=null;
  let originalFilename:string | null=null;
  let fileSizeBytes:number | null=null;
  let checksumSha256:string | null=null;
  let uploadedObjectKey:string | null=null;

  if (file) {
    const uploadError=validateUpload(file);
    if (uploadError) redirect(`/dokumente?error=${uploadError}`);
    if (!isDocumentStorageConfigured()) redirect("/dokumente?error=storage");

    const bytes=new Uint8Array(await file.arrayBuffer());
    const safeName=sanitizeFilename(file.name);
    const now=new Date();
    const year=now.getUTCFullYear();
    const month=String(now.getUTCMonth()+1).padStart(2,"0");
    uploadedObjectKey=`documents/${year}/${month}/${randomUUID()}-${safeName}`;

    try {
      await uploadDocumentObject({
        key:uploadedObjectKey,
        body:bytes,
        contentType:file.type || "application/octet-stream",
      });
    } catch {
      redirect("/dokumente?error=upload");
    }

    storageType="upload";
    storedRef=uploadedObjectKey;
    mimeType=file.type || "application/octet-stream";
    originalFilename=file.name;
    fileSizeBytes=file.size;
    checksumSha256=createHash("sha256").update(bytes).digest("hex");
  }

  try {
    const rows=await sql`
      INSERT INTO documents (
        title,category,storage_type,storage_ref,mime_type,status,
        document_date,valid_until,review_on,notes,
        meeting_id,resolution_id,member_id,finance_entry_id,sponsor_id,
        original_filename,file_size_bytes,uploaded_by,uploaded_at,checksum_sha256
      )
      VALUES (
        ${title},${category},${storageType},${storedRef},${mimeType},'active',
        ${documentDate || null}::date,${validUntil || null}::date,${reviewOn || null}::date,${notes || null},
        ${meetingId || null}::uuid,${resolutionId || null}::uuid,${memberId || null}::uuid,
        ${financeEntryId || null}::uuid,${sponsorId || null}::uuid,
        ${originalFilename},${fileSizeBytes},${file ? actor.id : null}::uuid,
        CASE WHEN ${Boolean(file)} THEN now() ELSE NULL END,
        ${checksumSha256}
      )
      RETURNING id::text
    `;

    const id=String(rows[0]?.id ?? "");
    await writeAudit(actor.id,"document.created","document",id,{
      title,
      category,
      storageType,
      originalFilename,
      fileSizeBytes,
      linkedMeeting:Boolean(meetingId),
      linkedResolution:Boolean(resolutionId),
      linkedMember:Boolean(memberId),
      linkedSponsor:Boolean(sponsorId),
    });
  } catch (error) {
    if (uploadedObjectKey) {
      try { await deleteDocumentObject(uploadedObjectKey); } catch {}
    }
    throw error;
  }

  revalidateDocuments();
  redirect(file ? "/dokumente?uploaded=1" : "/dokumente?created=1");
}

export async function updateDocumentStatusAction(formData: FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/dokumente?error=database");

  const id=value(formData,"id");
  const status=value(formData,"status");

  if (!id || !["draft","active","review","archived","expired"].includes(status)) {
    redirect("/dokumente?error=invalid");
  }

  const before=await sql`
    SELECT status,title,category,meeting_id::text
    FROM documents
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const document=before[0];
  if (!document) redirect("/dokumente?error=missing");
  if (document.category==="Protokoll" && document.meeting_id) {
    redirect(`/dokumente?error=protocol_managed`);
  }

  await sql`
    UPDATE documents
    SET
      status=${status},
      archived_at=CASE WHEN ${status}='archived' THEN COALESCE(archived_at,now()) ELSE NULL END,
      archived_by=CASE WHEN ${status}='archived' THEN ${actor.id}::uuid ELSE NULL END
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
  `;

  await writeAudit(actor.id,"document.status_changed","document",id,{
    title:String(before[0]?.title ?? ""),
    before:String(before[0]?.status ?? ""),
    after:status,
  });

  revalidateDocuments();
  redirect("/dokumente");
}

export async function archiveDocumentAction(formData: FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/dokumente?error=database");

  const id=value(formData,"id");
  if (!id) redirect("/dokumente?error=invalid");

  const documentRows=await sql`
    SELECT id::text,title,category,meeting_id::text
    FROM documents
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const document=documentRows[0];
  if (!document) redirect("/dokumente?error=missing");
  if (document.category==="Protokoll" && document.meeting_id) {
    redirect("/dokumente?error=protocol_managed");
  }

  const rows=await sql`
    UPDATE documents
    SET status='archived',archived_at=now(),archived_by=${actor.id}::uuid
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    RETURNING title
  `;

  await writeAudit(actor.id,"document.archived","document",id,{
    title:String(rows[0]?.title ?? ""),
  });

  revalidateDocuments();
  redirect("/dokumente?archived=1");
}

export async function restoreDocumentAction(formData: FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/archiv?error=database");

  const id=value(formData,"id");
  if (!id) redirect("/archiv?error=invalid");

  const documentRows=await sql`
    SELECT id::text,title,category,meeting_id::text
    FROM documents
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const document=documentRows[0];
  if (!document) redirect("/archiv?error=missing");
  if (document.category==="Protokoll" && document.meeting_id) {
    redirect("/archiv?error=protocol_locked");
  }

  const rows=await sql`
    UPDATE documents
    SET status='active',archived_at=NULL,archived_by=NULL
    WHERE id=${id}::uuid
    RETURNING title
  `;

  await writeAudit(actor.id,"document.restored","document",id,{
    title:String(rows[0]?.title ?? ""),
  });

  revalidateDocuments();
  redirect("/archiv?restored=1");
}

export async function deleteDocumentAction(formData: FormData) {
  return archiveDocumentAction(formData);
}
