import { NextResponse } from "next/server";
import { syncAllIntegrations } from "@/lib/club-sync";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request: Request) {
  const secret=process.env.CRON_SECRET?.trim();
  const authorization=request.headers.get("authorization") ?? "";

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ok:false,error:"unauthorized"},{status:401});
  }

  const startedAt=new Date().toISOString();
  const result=await syncAllIntegrations();

  return NextResponse.json({
    ok:result.ok,
    startedAt,
    finishedAt:new Date().toISOString(),
    results:result.results.map((item)=>({
      key:item.key,
      ok:item.ok,
      status:item.status,
      error:item.error ?? null,
    })),
  },{
    status:result.ok ? 200 : 207,
    headers:{"Cache-Control":"no-store"},
  });
}
