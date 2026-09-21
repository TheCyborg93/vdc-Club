"use server";

import { randomUUID } from "node:crypto";
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

const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const MAX_PHOTO_BATCH_SIZE = 80 * 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg","image/png","image/webp"]);

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function sanitizeFilename(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 120) || "foto";
}

function revalidateChronicle() {
  revalidatePath("/vereinschronik");
  revalidatePath("/vereinschronik/hall-of-fame");
  revalidatePath("/vereinschronik/erfolge");
  revalidatePath("/vereinschronik/galerie");
}

export async function createHonorAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/hall-of-fame?error=database");

  const honorType = value(formData, "honorType");
  const customTitle = value(formData, "customTitle");
  const year = Number(value(formData, "year"));
  const eventDate = value(formData, "eventDate");
  const winnerMemberId = value(formData, "winnerMemberId");
  const winnerName = value(formData, "winnerName");
  const runnerUpName = value(formData, "runnerUpName");
  const thirdPlaceName = value(formData, "thirdPlaceName");
  const participantsRaw = value(formData, "participants");
  const participants = participantsRaw ? Number(participantsRaw) : null;
  const tournamentFormat = value(formData, "tournamentFormat");
  const venue = value(formData, "venue");
  const finalScore = value(formData, "finalScore");
  const highFinishRaw = value(formData, "highFinish");
  const shortLegRaw = value(formData, "shortLeg");
  const averageRaw = value(formData, "average");
  const albumId = value(formData, "albumId");
  const highFinish = highFinishRaw ? Number(highFinishRaw) : null;
  const shortLeg = shortLegRaw ? Number(shortLegRaw) : null;
  const average = averageRaw ? Number(averageRaw.replace(",", ".")) : null;
  const notes = value(formData, "notes");

  if (
    !["club_champion","christmas_champion","other"].includes(honorType) ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2200 ||
    !winnerName ||
    (honorType === "other" && !customTitle)
  ) {
    redirect("/vereinschronik/hall-of-fame?error=missing");
  }

  const rows = await sql`
    INSERT INTO club_honors (
      honor_type,custom_title,year,event_date,winner_member_id,winner_name,
      runner_up_name,third_place_name,participants,tournament_format,venue,
      final_score,high_finish,short_leg,average,album_id,notes,created_by_user_id
    )
    VALUES (
      ${honorType},${customTitle || null},${year},${eventDate || null}::date,
      ${winnerMemberId || null}::uuid,${winnerName},${runnerUpName || null},
      ${thirdPlaceName || null},${participants},${tournamentFormat || null},${venue || null},
      ${finalScore || null},${highFinish},${shortLeg},${average},
      ${albumId || null}::uuid,${notes || null},${actor.id}::uuid
    )
    RETURNING id::text
  `;

  const id = String(rows[0]?.id ?? "");
  await writeAudit(actor.id,"chronicle.honor_created","club_honor",id,{honorType,year,winnerName});
  revalidateChronicle();
  redirect("/vereinschronik/hall-of-fame?created=1");
}

export async function updateHonorAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/hall-of-fame?error=database");

  const id = value(formData, "id");
  const customTitle = value(formData, "customTitle");
  const eventDate = value(formData, "eventDate");
  const winnerName = value(formData, "winnerName");
  const runnerUpName = value(formData, "runnerUpName");
  const thirdPlaceName = value(formData, "thirdPlaceName");
  const participantsRaw = value(formData, "participants");
  const participants = participantsRaw ? Number(participantsRaw) : null;
  const tournamentFormat = value(formData, "tournamentFormat");
  const venue = value(formData, "venue");
  const finalScore = value(formData, "finalScore");
  const highFinishRaw = value(formData, "highFinish");
  const shortLegRaw = value(formData, "shortLeg");
  const averageRaw = value(formData, "average");
  const albumId = value(formData, "albumId");
  const highFinish = highFinishRaw ? Number(highFinishRaw) : null;
  const shortLeg = shortLegRaw ? Number(shortLegRaw) : null;
  const average = averageRaw ? Number(averageRaw.replace(",", ".")) : null;
  const notes = value(formData, "notes");

  if (!id || !winnerName) {
    redirect(`/vereinschronik/hall-of-fame/${id}?error=invalid`);
  }

  await sql`
    UPDATE club_honors
    SET
      custom_title=${customTitle || null},
      event_date=${eventDate || null}::date,
      winner_name=${winnerName},
      runner_up_name=${runnerUpName || null},
      third_place_name=${thirdPlaceName || null},
      participants=${participants},
      tournament_format=${tournamentFormat || null},
      venue=${venue || null},
      final_score=${finalScore || null},
      high_finish=${highFinish},
      short_leg=${shortLeg},
      average=${average},
      album_id=${albumId || null}::uuid,
      notes=${notes || null}
    WHERE id=${id}::uuid
  `;

  await writeAudit(actor.id,"chronicle.honor_updated","club_honor",id,{winnerName});
  revalidateChronicle();
  revalidatePath(`/vereinschronik/hall-of-fame/${id}`);
  redirect(`/vereinschronik/hall-of-fame/${id}?updated=1`);
}

export async function deleteHonorAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/hall-of-fame?error=database");

  const id = value(formData,"id");
  if (!id) redirect("/vereinschronik/hall-of-fame?error=invalid");

  const rows = await sql`
    DELETE FROM club_honors
    WHERE id=${id}::uuid
    RETURNING winner_name,year,honor_type
  `;
  await writeAudit(actor.id,"chronicle.honor_deleted","club_honor",id,{
    winnerName:String(rows[0]?.winner_name ?? ""),
    year:Number(rows[0]?.year ?? 0),
  });
  revalidateChronicle();
  redirect("/vereinschronik/hall-of-fame?deleted=1");
}

export async function createAchievementAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/erfolge?error=database");

  const achievedOn = value(formData,"achievedOn");
  const category = value(formData,"category");
  const title = value(formData,"title");
  const description = value(formData,"description");
  const teamId = value(formData,"teamId");
  const memberId = value(formData,"memberId");

  if (!achievedOn || !category || !title) {
    redirect("/vereinschronik/erfolge?error=missing");
  }

  const rows = await sql`
    INSERT INTO club_achievements (
      achieved_on,category,title,description,team_id,member_id,created_by_user_id
    )
    VALUES (
      ${achievedOn}::date,${category},${title},${description || null},
      ${teamId || null}::uuid,${memberId || null}::uuid,${actor.id}::uuid
    )
    RETURNING id::text
  `;

  const id = String(rows[0]?.id ?? "");
  await writeAudit(actor.id,"chronicle.achievement_created","club_achievement",id,{title,category,achievedOn});
  revalidateChronicle();
  redirect("/vereinschronik/erfolge?created=1");
}

export async function deleteAchievementAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/erfolge?error=database");

  const id = value(formData,"id");
  if (!id) redirect("/vereinschronik/erfolge?error=invalid");

  const rows = await sql`
    DELETE FROM club_achievements
    WHERE id=${id}::uuid
    RETURNING title
  `;
  await writeAudit(actor.id,"chronicle.achievement_deleted","club_achievement",id,{
    title:String(rows[0]?.title ?? ""),
  });
  revalidateChronicle();
  redirect("/vereinschronik/erfolge?deleted=1");
}

export async function createAlbumAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/galerie?error=database");

  const title = value(formData,"title");
  const eventDate = value(formData,"eventDate");
  const description = value(formData,"description");

  if (!title) redirect("/vereinschronik/galerie?error=missing");

  const rows = await sql`
    INSERT INTO club_photo_albums (
      title,event_date,description,created_by_user_id
    )
    VALUES (
      ${title},${eventDate || null}::date,${description || null},${actor.id}::uuid
    )
    RETURNING id::text
  `;
  const id = String(rows[0]?.id ?? "");

  await writeAudit(actor.id,"chronicle.album_created","club_photo_album",id,{title,eventDate});
  revalidateChronicle();
  redirect("/vereinschronik/galerie?created=1");
}

export async function uploadPhotoAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/galerie?error=database");

  const albumId = value(formData,"albumId");
  const title = value(formData,"title");
  const caption = value(formData,"caption");
  const rawFiles = formData.getAll("files");
  const files = rawFiles.filter(
    (entry): entry is File => entry instanceof File && entry.size > 0,
  );

  if (!albumId || files.length === 0) {
    redirect("/vereinschronik/galerie?error=photo_missing");
  }
  if (files.length > 20) {
    redirect("/vereinschronik/galerie?error=photo_count");
  }
  if (files.some((file) => !allowedPhotoTypes.has(file.type))) {
    redirect("/vereinschronik/galerie?error=photo_type");
  }
  if (files.some((file) => file.size > MAX_PHOTO_SIZE)) {
    redirect("/vereinschronik/galerie?error=photo_size");
  }
  if (files.reduce((sum,file)=>sum+file.size,0) > MAX_PHOTO_BATCH_SIZE) {
    redirect("/vereinschronik/galerie?error=photo_batch_size");
  }
  if (!isDocumentStorageConfigured()) {
    redirect("/vereinschronik/galerie?error=storage");
  }

  const album = await sql`
    SELECT id::text
    FROM club_photo_albums
    WHERE id=${albumId}::uuid
    LIMIT 1
  `;
  if (!album[0]) redirect("/vereinschronik/galerie?error=album");

  const coverRows = await sql`
    SELECT EXISTS(
      SELECT 1 FROM club_photos WHERE album_id=${albumId}::uuid
    ) AS has_photos
  `;
  let albumAlreadyHasPhotos = Boolean(coverRows[0]?.has_photos);

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth()+1).padStart(2,"0");
  const uploadedKeys: string[] = [];
  const uploadedPhotoIds: string[] = [];

  try {
    for (const [index,file] of files.entries()) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const key = `chronicle/photos/${year}/${month}/${randomUUID()}-${sanitizeFilename(file.name)}`;
      await uploadDocumentObject({
        key,
        body:bytes,
        contentType:file.type,
      });
      uploadedKeys.push(key);

      const photoRows = await sql`
        INSERT INTO club_photos (
          album_id,title,caption,storage_ref,mime_type,original_filename,
          file_size_bytes,is_cover,uploaded_by_user_id
        )
        VALUES (
          ${albumId}::uuid,
          ${files.length === 1 ? title || null : null},
          ${caption || null},
          ${key},
          ${file.type},
          ${file.name},
          ${file.size},
          ${!albumAlreadyHasPhotos && index === 0},
          ${actor.id}::uuid
        )
        RETURNING id::text
      `;

      const photoId = String(photoRows[0]?.id ?? "");
      if (photoId) uploadedPhotoIds.push(photoId);
      albumAlreadyHasPhotos = true;

      await writeAudit(actor.id,"chronicle.photo_uploaded","club_photo",photoId,{
        albumId,
        originalFilename:file.name,
        size:file.size,
        batchSize:files.length,
      });
    }
  } catch (error) {
    if (uploadedPhotoIds.length) {
      await sql`
        DELETE FROM club_photos
        WHERE id = ANY(${uploadedPhotoIds}::uuid[])
      `;
    }
    for (const key of uploadedKeys) {
      try { await deleteDocumentObject(key); } catch {}
    }
    throw error;
  }

  revalidateChronicle();
  revalidatePath(`/vereinschronik/galerie/${albumId}`);
  redirect(`/vereinschronik/galerie/${albumId}?uploaded=${files.length}`);
}

export async function setAlbumCoverAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/galerie?error=database");

  const photoId = value(formData,"photoId");
  const albumId = value(formData,"albumId");
  if (!photoId || !albumId) redirect("/vereinschronik/galerie?error=invalid");

  await sql`UPDATE club_photos SET is_cover=false WHERE album_id=${albumId}::uuid`;
  await sql`
    UPDATE club_photos
    SET is_cover=true
    WHERE id=${photoId}::uuid AND album_id=${albumId}::uuid
  `;

  await writeAudit(actor.id,"chronicle.album_cover_changed","club_photo_album",albumId,{photoId});
  revalidateChronicle();
  revalidatePath(`/vereinschronik/galerie/${albumId}`);
  redirect(`/vereinschronik/galerie/${albumId}?cover=1`);
}

export async function deletePhotoAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/galerie?error=database");

  const id = value(formData,"id");
  if (!id) redirect("/vereinschronik/galerie?error=invalid");

  const rows = await sql`
    DELETE FROM club_photos
    WHERE id=${id}::uuid
    RETURNING storage_ref,album_id::text,original_filename,is_cover
  `;
  const photo = rows[0];
  if (photo?.storage_ref) {
    try { await deleteDocumentObject(String(photo.storage_ref)); } catch {}
  }

  if (photo?.is_cover && photo?.album_id) {
    await sql`
      UPDATE club_photos
      SET is_cover=true
      WHERE id=(
        SELECT id FROM club_photos
        WHERE album_id=${String(photo.album_id)}::uuid
        ORDER BY created_at
        LIMIT 1
      )
    `;
  }

  await writeAudit(actor.id,"chronicle.photo_deleted","club_photo",id,{
    filename:String(photo?.original_filename ?? ""),
  });
  revalidateChronicle();
  if (photo?.album_id) {
    revalidatePath(`/vereinschronik/galerie/${String(photo.album_id)}`);
    redirect(`/vereinschronik/galerie/${String(photo.album_id)}?photo_deleted=1`);
  }
  redirect("/vereinschronik/galerie?photo_deleted=1");
}

export async function deleteAlbumAction(formData: FormData) {
  const actor = await requirePermission("chronicle.write");
  const sql = getDb();
  if (!sql) redirect("/vereinschronik/galerie?error=database");

  const id = value(formData,"id");
  if (!id) redirect("/vereinschronik/galerie?error=invalid");

  const [albumRows, photoRows] = await Promise.all([
    sql`SELECT title FROM club_photo_albums WHERE id=${id}::uuid LIMIT 1`,
    sql`SELECT storage_ref FROM club_photos WHERE album_id=${id}::uuid`,
  ]);

  for (const photo of photoRows) {
    try { await deleteDocumentObject(String(photo.storage_ref)); } catch {}
  }

  await sql`DELETE FROM club_photo_albums WHERE id=${id}::uuid`;
  await writeAudit(actor.id,"chronicle.album_deleted","club_photo_album",id,{
    title:String(albumRows[0]?.title ?? ""),
    photos:photoRows.length,
  });

  revalidateChronicle();
  redirect("/vereinschronik/galerie?album_deleted=1");
}
