import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/access";
import { exportFilename,toCsv } from "@/lib/export";

export async function GET() {
  const user=await getCurrentUser();
  if (!user) return new Response("Unauthorized",{status:401});
  if (!hasPermission(user.roles,"resolutions.read")) return new Response("Forbidden",{status:403});

  const sql=getDb();
  if (!sql) return new Response("Database unavailable",{status:503});

  const rows=await sql`
    SELECT
      r.resolution_number,r.title,r.decision_text,r.votes_yes,r.votes_no,r.votes_abstain,
      r.status,r.decided_at,r.implemented_at,r.implementation_notes,m.title AS meeting_title,
      t.title AS task_title,t.status AS task_status,t.due_date,
      owner.first_name AS owner_first_name,owner.last_name AS owner_last_name
    FROM resolutions r
    LEFT JOIN meetings m ON m.id=r.meeting_id
    LEFT JOIN LATERAL (\n      SELECT tx.* FROM tasks tx\n      WHERE tx.source_type='resolution'\n        AND tx.source_id=r.id\n        AND tx.deleted_at IS NULL\n      ORDER BY CASE WHEN tx.status='cancelled' THEN 1 ELSE 0 END,tx.created_at DESC\n      LIMIT 1\n    ) t ON true
    LEFT JOIN members owner ON owner.id=t.owner_member_id
    ORDER BY r.decided_at DESC
  `;

  const csv=toCsv(
    ["Nummer","Titel","Beschlusstext","Ja","Nein","Enthaltung","Status","Beschlossen am","Umgesetzt am","Umsetzungsnotiz","Sitzung","Folgeaufgabe","Aufgabenstatus","Frist","Verantwortlich"],
    rows.map((row)=>[
      row.resolution_number,row.title,row.decision_text,row.votes_yes,row.votes_no,row.votes_abstain,
      row.status,row.decided_at,row.implemented_at,row.implementation_notes,row.meeting_title,row.task_title,row.task_status,row.due_date,
      row.owner_first_name ? String(row.owner_first_name)+" "+String(row.owner_last_name ?? "") : "",
    ]),
  );

  return new Response("\\uFEFF"+csv,{
    headers:{
      "Content-Type":"text/csv; charset=utf-8",
      "Content-Disposition":'attachment; filename="'+exportFilename("vdc-beschluesse","csv")+'"',
    },
  });
}
