import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/access";
import { exportFilename,toCsv } from "@/lib/export";

export async function GET() {
  const user=await getCurrentUser();
  if (!user) return new Response("Unauthorized",{status:401});
  if (!hasPermission(user.roles,"members.write")) return new Response("Forbidden",{status:403});

  const sql=getDb();
  if (!sql) return new Response("Database unavailable",{status:503});

  const rows=await sql`
    SELECT
      m.member_number,m.first_name,m.last_name,m.email,m.phone,m.birth_date,
      m.join_date,m.notice_date,m.leave_date,m.status,m.membership_type,
      COALESCE(string_agg(DISTINCT COALESCE(t.short_name,t.name),', ' ORDER BY COALESCE(t.short_name,t.name))
        FILTER (WHERE t.id IS NOT NULL),'') AS teams
    FROM members m
    LEFT JOIN team_members tm ON tm.member_id=m.id AND tm.is_active=true
    LEFT JOIN teams t ON t.id=tm.team_id AND t.deleted_at IS NULL
    GROUP BY m.id
    ORDER BY m.last_name,m.first_name
  `;

  const csv=toCsv(
    ["Mitgliedsnummer","Vorname","Nachname","E-Mail","Telefon","Geburtsdatum","Eintritt","Kündigung","Austritt","Status","Mitgliedsart","Mannschaften"],
    rows.map((row)=>[
      row.member_number,row.first_name,row.last_name,row.email,row.phone,row.birth_date,
      row.join_date,row.notice_date,row.leave_date,row.status,row.membership_type,row.teams,
    ]),
  );

  return new Response("\\uFEFF"+csv,{
    headers:{
      "Content-Type":"text/csv; charset=utf-8",
      "Content-Disposition":'attachment; filename="'+exportFilename("vdc-mitglieder","csv")+'"',
    },
  });
}
