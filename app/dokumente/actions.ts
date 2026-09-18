"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function revalidateDocuments() {
  revalidatePath("/dokumente");
  revalidatePath("/archiv");
  revalidatePath("/");
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

  if (!title || !category) redirect("/dokumente?error=missing");

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

  const rows=await sql`
    INSERT INTO documents (
      title,category,storage_type,storage_ref,status,
      document_date,valid_until,review_on,notes,
      meeting_id,resolution_id,member_id,finance_entry_id,sponsor_id
    )
    VALUES (
      ${title},${category},'link',${storageRef || null},'active',
      ${documentDate || null}::date,${validUntil || null}::date,${reviewOn || null}::date,${notes || null},
      ${meetingId || null}::uuid,${resolutionId || null}::uuid,${memberId || null}::uuid,
      ${financeEntryId || null}::uuid,${sponsorId || null}::uuid
    )
    RETURNING id::text
  `;

  const id=String(rows[0]?.id ?? "");
  await writeAudit(actor.id,"document.created","document",id,{
    title,category,
    linkedMeeting:Boolean(meetingId),
    linkedResolution:Boolean(resolutionId),
    linkedMember:Boolean(memberId),
    linkedSponsor:Boolean(sponsorId),
  });

  revalidateDocuments();
  redirect("/dokumente?created=1");
}

export async function updateDocumentStatusAction(formData: FormData) {
  const actor=await requirePermission("documents.write");
  const sql=getDb();
  if (!sql) redirect("/dokumente?error=database");

  const id=value(formData,"id");
  const status=value(formData,"status");

  if (!id || !["active","review","archived","expired"].includes(status)) {
    redirect("/dokumente?error=invalid");
  }

  const before=await sql`
    SELECT status,title
    FROM documents
    WHERE id=${id}::uuid
    LIMIT 1
  `;

  await sql`
    UPDATE documents
    SET
      status=${status},
      archived_at=CASE WHEN ${status}='archived' THEN COALESCE(archived_at,now()) ELSE NULL END,
      archived_by=CASE WHEN ${status}='archived' THEN ${actor.id}::uuid ELSE NULL END
    WHERE id=${id}::uuid
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

  const rows=await sql`
    UPDATE documents
    SET status='archived',archived_at=now(),archived_by=${actor.id}::uuid
    WHERE id=${id}::uuid
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
