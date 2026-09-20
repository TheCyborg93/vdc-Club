import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/access";
import {
  getDocumentObject,
  isDocumentStorageConfigured,
} from "@/lib/document-storage";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(
  request:Request,
  {params}:{params:Promise<{id:string}>},
) {
  const user=await getCurrentUser();
  if (!user) return new Response("Unauthorized",{status:401});
  if (!hasPermission(user.roles,"chronicle.read")) {
    return new Response("Forbidden",{status:403});
  }

  const sql=getDb();
  if (!sql) return new Response("Database unavailable",{status:503});
  if (!isDocumentStorageConfigured()) {
    return new Response("Storage unavailable",{status:503});
  }

  const {id}=await params;
  const rows=await sql`
    SELECT storage_ref,mime_type,original_filename
    FROM club_photos
    WHERE id=${id}::uuid
    LIMIT 1
  `;
  const photo=rows[0];
  if (!photo?.storage_ref) return new Response("Not found",{status:404});

  try {
    const object=await getDocumentObject(String(photo.storage_ref));
    if (!object.Body) return new Response("Not found",{status:404});
    const bytes=await object.Body.transformToByteArray();
    const mime=String(photo.mime_type || object.ContentType || "application/octet-stream");
    const filename=String(photo.original_filename || "foto").replace(/[\r\n"]/g,"_");
    const body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
    const forceDownload=new URL(request.url).searchParams.get("download")==="1";

    return new Response(body,{
      headers:{
        "Content-Type":mime,
        "Content-Length":String(bytes.byteLength),
        "Content-Disposition":(forceDownload?"attachment":"inline")+'; filename="'+filename+'"; filename*=UTF-8\'\''+encodeURIComponent(filename),
        "Cache-Control":"private, no-store, max-age=0",
        "X-Content-Type-Options":"nosniff",
      },
    });
  } catch {
    return new Response("File unavailable",{status:502});
  }
}
