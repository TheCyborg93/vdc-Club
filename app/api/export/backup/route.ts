import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/access";
import { exportFilename } from "@/lib/export";

export async function GET() {
  const user=await getCurrentUser();
  if (!user) return new Response("Unauthorized",{status:401});
  if (!hasPermission(user.roles,"settings.manage")) return new Response("Forbidden",{status:403});

  const sql=getDb();
  if (!sql) return new Response("Database unavailable",{status:503});

  const [
    profile,members,teams,teamMembers,tasks,meetings,attendees,agenda,resolutions,
    events,finance,budgets,fees,documents,documentVersions,sponsors,trainingSessions,trainingAttendance,
    trainingRules,trainingPauses,trainingSeasons
  ]=await Promise.all([
    sql`SELECT * FROM club_profile ORDER BY id`,
    sql`SELECT * FROM members ORDER BY last_name,first_name`,
    sql`SELECT * FROM teams ORDER BY name`,
    sql`SELECT * FROM team_members ORDER BY team_id,member_id`,
    sql`SELECT * FROM tasks ORDER BY created_at`,
    sql`SELECT * FROM meetings ORDER BY starts_at`,
    sql`SELECT * FROM meeting_attendees ORDER BY meeting_id,member_id`,
    sql`SELECT * FROM agenda_items ORDER BY meeting_id,position`,
    sql`SELECT * FROM resolutions ORDER BY decided_at`,
    sql`SELECT * FROM club_events ORDER BY starts_at`,
    sql`SELECT * FROM finance_entries ORDER BY booked_on`,
    sql`SELECT * FROM finance_budgets ORDER BY fiscal_year,category`,
    sql`SELECT * FROM membership_fees ORDER BY fiscal_year,member_id`,
    sql`SELECT * FROM documents ORDER BY created_at`,
    sql`SELECT * FROM document_versions ORDER BY document_id,version_number`,
    sql`SELECT * FROM sponsors ORDER BY name`,
    sql`SELECT * FROM training_sessions ORDER BY scheduled_at`,
    sql`SELECT * FROM training_attendance ORDER BY session_id,member_id`,
    sql`SELECT * FROM training_schedule_rules ORDER BY weekday`,
    sql`SELECT * FROM training_blackouts ORDER BY starts_on`,
    sql`SELECT * FROM training_seasons ORDER BY starts_on`
  ]);

  const payload={
    format:"vdc-club-export-v1",
    createdAt:new Date().toISOString(),
    note:"Manueller Vereinsdaten-Export. Authentifizierungsgeheimnisse, Passwort-Hashes und Sessions sind bewusst nicht enthalten.",
    data:{
      clubProfile:profile,members,teams,teamMembers,tasks,meetings,meetingAttendees:attendees,
      agendaItems:agenda,resolutions,clubEvents:events,financeEntries:finance,financeBudgets:budgets,
      membershipFees:fees,documents,documentVersions,sponsors,trainingSessions,trainingAttendance,
      trainingScheduleRules:trainingRules,trainingBlackouts:trainingPauses,trainingSeasons
    }
  };

  return new Response(JSON.stringify(payload,null,2),{
    headers:{
      "Content-Type":"application/json; charset=utf-8",
      "Content-Disposition":'attachment; filename="'+exportFilename("vdc-vereinsdaten","json")+'"',
    },
  });
}
