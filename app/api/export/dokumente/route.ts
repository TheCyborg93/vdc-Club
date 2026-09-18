import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/access";
import { exportFilename,toCsv } from "@/lib/export";

export async function GET() {
  const user=await getCurrentUser();
  if (!user) return new Response("Unauthorized",{status:401});
  if (!hasPermission(user.roles,"documents.read")) return new Response("Forbidden",{status:403});

  const sql=getDb();
  if (!sql) return new Response("Database unavailable",{status:503});

  const rows=await sql`
    SELECT
      d.title,d.category,d.status,d.document_date,d.review_on,d.valid_until,
      d.original_filename,d.file_size_bytes,d.mime_type,
      d.created_at,d.archived_at,m.title AS meeting_title,
      r.resolution_number,s.name AS sponsor_name
    FROM documents d
    LEFT JOIN meetings m ON m.id=d.meeting_id
    LEFT JOIN resolutions r ON r.id=d.resolution_id
    LEFT JOIN sponsors s ON s.id=d.sponsor_id
    ORDER BY COALESCE(d.document_date,d.created_at::date) DESC
  `;

  const csv=toCsv(
    ["Titel","Kategorie","Status","Dokumentdatum","Prüfen am","Gültig bis","Dateiname","Dateigröße Bytes","MIME-Typ","Angelegt","Archiviert","Sitzung","Beschluss","Sponsor"],
    rows.map((row)=>[
      row.title,row.category,row.status,row.document_date,row.review_on,row.valid_until,
      row.original_filename,row.file_size_bytes,row.mime_type,
      row.created_at,row.archived_at,row.meeting_title,row.resolution_number,row.sponsor_name,
    ]),
  );

  return new Response("\\uFEFF"+csv,{
    headers:{
      "Content-Type":"text/csv; charset=utf-8",
      "Content-Disposition":'attachment; filename="'+exportFilename("vdc-dokumente","csv")+'"',
    },
  });
}
