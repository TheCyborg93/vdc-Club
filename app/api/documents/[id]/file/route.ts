import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/access";
import {
  getDocumentObject,
  isDocumentStorageConfigured,
} from "@/lib/document-storage";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function safeDispositionFilename(value:string) {
  return value.replace(/[\r\n"]/g,"_");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id:string }> },
) {
  const user=await getCurrentUser();
  if (!user) return new Response("Unauthorized",{status:401});
  if (!hasPermission(user.roles,"documents.read")) {
    return new Response("Forbidden",{status:403});
  }

  const sql=getDb();
  if (!sql) return new Response("Database unavailable",{status:503});
  if (!isDocumentStorageConfigured()) {
    return new Response("Document storage unavailable",{status:503});
  }

  const { id }=await params;
  const rows=await sql`
    SELECT
      id::text,
      storage_type,
      storage_ref,
      mime_type,
      original_filename,
      title
    FROM documents
    WHERE id=${id}::uuid
    LIMIT 1
  `;

  const doc=rows[0];
  if (!doc || doc.storage_type!=="upload" || !doc.storage_ref) {
    return new Response("Not found",{status:404});
  }

  try {
    const object=await getDocumentObject(String(doc.storage_ref));
    if (!object.Body) return new Response("Not found",{status:404});

    const bytes=await object.Body.transformToByteArray();
    const mime=String(doc.mime_type || object.ContentType || "application/octet-stream");
    const filename=safeDispositionFilename(
      String(doc.original_filename || doc.title || "dokument"),
    );

    const forceDownload=new URL(request.url).searchParams.get("download")==="1";
    const inlineSafe=
      mime==="application/pdf" ||
      mime==="text/plain" ||
      mime==="image/jpeg" ||
      mime==="image/png" ||
      mime==="image/webp";

    const disposition=forceDownload || !inlineSafe ? "attachment" : "inline";

    return new Response(bytes,{
      headers:{
        "Content-Type":mime,
        "Content-Length":String(bytes.byteLength),
        "Content-Disposition":
          disposition+'; filename="'+filename+'"; filename*=UTF-8\'\''+encodeURIComponent(filename),
        "Cache-Control":"private, no-store, max-age=0",
        "X-Content-Type-Options":"nosniff",
      },
    });
  } catch {
    return new Response("File unavailable",{status:502});
  }
}
