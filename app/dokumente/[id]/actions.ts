"use server";

import { createHash,randomUUID } from "node:crypto";
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

const allowedUploads:Record<string,string[]>={
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

function value(formData:FormData,key:string) {
  return String(formData.get(key) ?? "").trim();
}

function ext(name:string) {
  const pos=name.lastIndexOf(".");
  return pos>=0 ? name.slice(pos+1).toLowerCase() : "";
}

function safeFilename(name:string) {
  const cleaned=name.normalize("NFKD")
    .replace(/[^\w.\-]+/g,"-")
    .replace(/-+/g,"-")
    .replace(/^-|-$/g,"");
  return cleaned.slice(0,120) || "dokument";
}

function validateUpload(file:File) {
  if (file.size<=0) return "empty";
  if (file.size>MAX_FILE_SIZE) return "size";
  const allowed=allowedUploads[ext(file.name)];
  if (!allowed) return "type";
  const mime=(file.type || "application/octet-stream").toLowerCase();
  if (!allowed.includes(mime)) return "type";
  return null;
}

function refresh(id:string) {
  revalidatePath("/dokumente");
  revalidatePath("/archiv");
  revalidatePath("/suche");
  revalidatePath("/hinweise");
  revalidatePath(`/dokumente/${id}`);
  revalidatePath("/");
}

export async function updateDocumentMetadataAction(formData:FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  const id=value(formData,"id");
  if (!sql) redirect(`/dokumente/${id}?error=database`);

  const title=value(formData,"title");
  const category=value(formData,"category");
  const documentDate=value(formData,"documentDate");
  const reviewOn=value(formData,"reviewOn");
  const validUntil=value(formData,"validUntil");
  const notes=value(formData,"notes");
  const status=value(formData,"status");
  const memberId=value(formData,"memberId");
  const meetingId=value(formData,"meetingId");
  const resolutionId=value(formData,"resolutionId");
  const financeEntryId=value(formData,"financeEntryId");
  const sponsorId=value(formData,"sponsorId");

  if (
    !id ||
    !title ||
    !category ||
    !["draft","active","review","expired","archived"].includes(status)
  ) {
    redirect(`/dokumente/${id}?error=missing`);
  }

  const before=await sql`
    SELECT title,category,status
    FROM documents
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;

  if (!before.length) redirect("/dokumente?error=missing");

  await sql`
    UPDATE documents
    SET
      title=${title},
      category=${category},
      document_date=${documentDate || null}::date,
      review_on=${reviewOn || null}::date,
      valid_until=${validUntil || null}::date,
      notes=${notes || null},
      status=${status},
      archived_at=CASE
        WHEN ${status}='archived' THEN COALESCE(archived_at,now())
        ELSE NULL
      END,
      archived_by=CASE
        WHEN ${status}='archived' THEN ${actor.id}::uuid
        ELSE NULL
      END,
      member_id=${memberId || null}::uuid,
      meeting_id=${meetingId || null}::uuid,
      resolution_id=${resolutionId || null}::uuid,
      finance_entry_id=${financeEntryId || null}::uuid,
      sponsor_id=${sponsorId || null}::uuid,
      updated_at=now()
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
  `;

  await writeAudit(actor.id,"document.metadata_updated","document",id,{
    titleBefore:String(before[0].title),
    titleAfter:title,
    categoryBefore:String(before[0].category),
    categoryAfter:category,
    statusBefore:String(before[0].status),
    statusAfter:status,
  });

  refresh(id);
  redirect(`/dokumente/${id}?saved=1`);
}

export async function replaceDocumentVersionAction(formData:FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  const id=value(formData,"id");
  if (!sql) redirect(`/dokumente/${id}?error=database`);

  const storageRef=value(formData,"storageRef");
  const changeNote=value(formData,"changeNote");
  const rawFile=formData.get("file");
  const file=rawFile instanceof File && rawFile.size>0 ? rawFile : null;

  if (!id || (!file && !storageRef) || (file && storageRef)) {
    redirect(`/dokumente/${id}?error=source`);
  }

  if (storageRef) {
    try {
      const url=new URL(storageRef);
      if (!["http:","https:"].includes(url.protocol)) {
        redirect(`/dokumente/${id}?error=invalid`);
      }
    } catch {
      redirect(`/dokumente/${id}?error=invalid`);
    }
  }

  const currentRows=await sql`
    SELECT
      id::text,title,storage_type,storage_ref,mime_type,original_filename,
      file_size_bytes,checksum_sha256,uploaded_by::text,uploaded_at,created_at,
      current_version_number
    FROM documents
    WHERE id=${id}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;

  const current=currentRows[0];
  if (!current) redirect("/dokumente?error=missing");
  if (current.storage_type==="internal") {
    redirect(`/dokumente/${id}?error=protected_source`);
  }

  const nextStorageType=file ? "upload" : "link";
  let nextStorageRef:string | null=storageRef || null;
  let mimeType:string | null=null;
  let originalFilename:string | null=null;
  let fileSizeBytes:number | null=null;
  let checksum:string | null=null;
  let uploadedKey:string | null=null;

  if (file) {
    const error=validateUpload(file);
    if (error) redirect(`/dokumente/${id}?error=${error}`);
    if (!isDocumentStorageConfigured()) redirect(`/dokumente/${id}?error=storage`);

    const bytes=new Uint8Array(await file.arrayBuffer());
    const now=new Date();
    const year=now.getUTCFullYear();
    const month=String(now.getUTCMonth()+1).padStart(2,"0");
    const nextVersion=Number(current.current_version_number ?? 1)+1;
    uploadedKey=`documents/${year}/${month}/${id}/v${nextVersion}-${randomUUID()}-${safeFilename(file.name)}`;

    try {
      await uploadDocumentObject({
        key:uploadedKey,
        body:bytes,
        contentType:file.type || "application/octet-stream",
      });
    } catch {
      redirect(`/dokumente/${id}?error=upload`);
    }

    nextStorageRef=uploadedKey;
    mimeType=file.type || "application/octet-stream";
    originalFilename=file.name;
    fileSizeBytes=file.size;
    checksum=createHash("sha256").update(bytes).digest("hex");
  }

  try {
    const rows=await sql`
      WITH current AS (
        SELECT *
        FROM documents
        WHERE id=${id}::uuid
          AND deleted_at IS NULL
      ),
      archived AS (
        INSERT INTO document_versions (
          document_id,version_number,storage_type,storage_ref,mime_type,
          original_filename,file_size_bytes,checksum_sha256,
          created_by,created_at,replaced_at,change_note
        )
        SELECT
          c.id,c.current_version_number,c.storage_type,c.storage_ref,c.mime_type,
          c.original_filename,c.file_size_bytes,c.checksum_sha256,
          c.uploaded_by,COALESCE(c.uploaded_at,c.created_at),now(),${changeNote || null}
        FROM current c
        ON CONFLICT (document_id,version_number) DO NOTHING
        RETURNING id
      )
      UPDATE documents d
      SET
        storage_type=${nextStorageType},
        storage_ref=${nextStorageRef},
        mime_type=${mimeType},
        original_filename=${originalFilename},
        file_size_bytes=${fileSizeBytes},
        checksum_sha256=${checksum},
        uploaded_by=CASE WHEN ${Boolean(file)} THEN ${actor.id}::uuid ELSE NULL END,
        uploaded_at=now(),
        current_version_number=d.current_version_number+1,
        updated_at=now()
      WHERE d.id=${id}::uuid
        AND d.deleted_at IS NULL
      RETURNING d.current_version_number
    `;

    if (!rows.length) throw new Error("DOCUMENT_VERSION_UPDATE_FAILED");

    await writeAudit(actor.id,"document.version_replaced","document",id,{
      title:String(current.title),
      fromVersion:Number(current.current_version_number ?? 1),
      toVersion:Number(rows[0].current_version_number),
      storageType:nextStorageType,
      originalFilename,
      changeNote:changeNote || null,
    });
  } catch (error) {
    if (uploadedKey) {
      try { await deleteDocumentObject(uploadedKey); } catch {}
    }
    throw error;
  }

  refresh(id);
  redirect(`/dokumente/${id}?version=1`);
}
