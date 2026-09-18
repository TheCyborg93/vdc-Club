"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveTrainingSeasonAction(formData: FormData) {
  const actor=await requirePermission("training.write");
  const sql=getDb();
  if (!sql) redirect("/training/auswertung?error=database");

  const id=value(formData,"id");
  const label=value(formData,"label");
  const startsOn=value(formData,"startsOn");
  const endsOn=value(formData,"endsOn");
  const notes=value(formData,"notes");
  const isActive=value(formData,"isActive")==="true";

  if (!label || !startsOn || !endsOn || endsOn<startsOn) {
    redirect("/training/auswertung?error=season");
  }

  if (isActive) {
    await sql`UPDATE training_seasons SET is_active=false WHERE is_active=true`;
  }

  let seasonId=id;

  if (id) {
    const rows=await sql`
      UPDATE training_seasons
      SET
        label=${label},
        starts_on=${startsOn}::date,
        ends_on=${endsOn}::date,
        notes=${notes || null},
        is_active=${isActive}
      WHERE id=${id}::uuid
      RETURNING id::text
    `;
    seasonId=String(rows[0]?.id ?? id);
  } else {
    const rows=await sql`
      INSERT INTO training_seasons (
        label,starts_on,ends_on,is_active,notes,created_by
      )
      VALUES (
        ${label},${startsOn}::date,${endsOn}::date,${isActive},
        ${notes || null},${actor.id}::uuid
      )
      ON CONFLICT (label)
      DO UPDATE SET
        starts_on=EXCLUDED.starts_on,
        ends_on=EXCLUDED.ends_on,
        is_active=EXCLUDED.is_active,
        notes=EXCLUDED.notes
      RETURNING id::text
    `;
    seasonId=String(rows[0]?.id ?? "");
  }

  await writeAudit(
    actor.id,
    id ? "training.season_updated" : "training.season_created",
    "training_season",
    seasonId || null,
    { label,startsOn,endsOn,isActive },
  );

  revalidatePath("/training");
  revalidatePath("/training/auswertung");
  redirect(`/training/auswertung?mode=season&season=${seasonId}&saved=1`);
}

export async function activateTrainingSeasonAction(formData: FormData) {
  const actor=await requirePermission("training.write");
  const sql=getDb();
  if (!sql) redirect("/training/auswertung?error=database");

  const id=value(formData,"id");
  if (!id) redirect("/training/auswertung?error=season");

  await sql`UPDATE training_seasons SET is_active=false WHERE is_active=true`;
  const rows=await sql`
    UPDATE training_seasons
    SET is_active=true
    WHERE id=${id}::uuid
    RETURNING id::text,label
  `;

  if (!rows.length) redirect("/training/auswertung?error=season");

  await writeAudit(actor.id,"training.season_activated","training_season",id,{
    label:String(rows[0].label),
  });

  revalidatePath("/training");
  revalidatePath("/training/auswertung");
  redirect(`/training/auswertung?mode=season&season=${id}&active=1`);
}


export async function deleteTrainingSeasonAction(formData: FormData) {
  const actor=await requirePermission("training.write");
  const sql=getDb();
  if (!sql) redirect("/training/auswertung?error=database");

  const id=value(formData,"id");
  if (!id) redirect("/training/auswertung?error=season");

  const rows=await sql`
    SELECT
      id::text,label,is_active,
      EXISTS(SELECT 1 FROM teams t WHERE t.season=training_seasons.label) AS has_teams
    FROM training_seasons
    WHERE id=${id}::uuid
    LIMIT 1
  `;
  const season=rows[0];

  if (!season || season.is_active || season.has_teams) {
    redirect(`/training/auswertung?mode=season&season=${id}&error=season_delete`);
  }

  await sql`DELETE FROM training_seasons WHERE id=${id}::uuid`;
  await writeAudit(actor.id,"training.season_deleted","training_season",id,{
    label:String(season.label),
  });

  revalidatePath("/training");
  revalidatePath("/training/auswertung");
  redirect("/training/auswertung?mode=season&deleted=1");
}
