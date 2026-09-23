import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connectionString=process.env.DATABASE_URL;
const branch=process.env.VERCEL_GIT_COMMIT_REF;

if(!connectionString){
  console.log("[meeting-v3-schema] DATABASE_URL fehlt – Migration wird übersprungen.");
  process.exit(0);
}

if(branch && branch!=="dev2"){
  console.log(`[meeting-v3-schema] Branch ${branch} – V3-Migration ist nur für dev2 aktiviert.`);
  process.exit(0);
}

const sql=neon(connectionString);
const existing=await sql.query(
  "SELECT to_regclass('public.meeting_v3_meetings')::text AS table_name",
  [],
);

if(existing[0]?.table_name){
  console.log("[meeting-v3-schema] Schema bereits vorhanden.");
  process.exit(0);
}

const source=await readFile(
  new URL("../database/20260922_meeting_v3_new_system.sql",import.meta.url),
  "utf8",
);

const statements=source
  .split(/;\s*(?:\r?\n|$)/g)
  .map((statement)=>statement.trim())
  .filter(Boolean);

console.log(`[meeting-v3-schema] V3-Schema fehlt – ${statements.length} Statements werden angewendet.`);

for(let index=0;index<statements.length;index+=1){
  await sql.query(statements[index],[]);
  console.log(`[meeting-v3-schema] ${index+1}/${statements.length}`);
}

const verify=await sql.query(
  "SELECT to_regclass('public.meeting_v3_meetings')::text AS table_name",
  [],
);

if(!verify[0]?.table_name){
  throw new Error("meeting_v3_meetings wurde nach der Migration nicht gefunden.");
}

console.log("[meeting-v3-schema] V3-Schema erfolgreich bereitgestellt.");
