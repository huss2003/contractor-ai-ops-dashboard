import { redirect } from "next/navigation";
import { detectAnomalies } from "./anomaly";
import { currentOrgId } from "./auth";
import { addDays, computeMetrics, dailySeries } from "./metrics";
import { getRepo } from "./repo";

export interface RangeParams { from?: string; to?: string; grain?: string }
const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : undefined);
const HISTORY_DAYS = 21; // extra lead-in so z-scores have a baseline on day one of the range

/** Auth + org scoping + date range + metrics + alerts for one dashboard request. */
export async function load(sp: RangeParams) {
  const repo = getRepo();
  const org = await repo.getOrg(currentOrgId());
  if (!org) redirect("/login");
  const today = new Date().toISOString().slice(0, 10);
  let to = valid(sp.to) ?? today;
  let from = valid(sp.from) ?? addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if (from < addDays(to, -365)) from = addDays(to, -365);
  const events = await repo.listEvents(org.id, `${addDays(from, -HISTORY_DAYS)}T00:00:00Z`, `${addDays(to, 1)}T00:00:00Z`);
  const alerts = detectAnomalies(dailySeries(events, addDays(from, -HISTORY_DAYS), to)).filter((a) => a.date >= from);
  return { repo, org, from, to, grain: sp.grain === "week" ? "week" : "day", m: computeMetrics(events, from, to), alerts };
}

export const fmt = {
  pct: (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`),
  usd: (x: number) => x.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
  min: (x: number | null) => (x === null ? "n/a" : `${x.toFixed(1)} min`),
};
