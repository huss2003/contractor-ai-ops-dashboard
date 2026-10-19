import { NextResponse } from "next/server";
import { getRepo } from "@/lib/repo";
import { safeEqual } from "@/lib/security";
import { runWeekly } from "@/lib/weekly";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const repo = getRepo();
  const done: string[] = [];
  for (const org of await repo.listOrgs()) {
    await runWeekly(repo, org);
    done.push(org.id);
  }
  return NextResponse.json({ ok: true, orgs: done });
}
