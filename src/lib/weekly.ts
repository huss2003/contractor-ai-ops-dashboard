import { detectAnomalies } from "./anomaly";
import { addDays, computeMetrics, dailySeries } from "./metrics";
import type { Repo } from "./repo";
import { buildFacts, generateSummary, getSummarizer } from "./summary";
import type { Org, Summary } from "./types";

/** Summarise the 7 full days ending yesterday (UTC) against the 7 before, and persist it. */
export async function runWeekly(repo: Repo, org: Org, now = new Date()): Promise<Summary> {
  const end = addDays(now.toISOString().slice(0, 10), -1);
  const events = await repo.listEvents(org.id, `${addDays(end, -34)}T00:00:00Z`, `${addDays(end, 1)}T00:00:00Z`);
  const cur = computeMetrics(events, addDays(end, -6), end);
  const prev = computeMetrics(events, addDays(end, -13), addDays(end, -7));
  const anomalies = detectAnomalies(dailySeries(events, addDays(end, -34), end)).filter((a) => a.date > addDays(end, -7));
  const r = await generateSummary(getSummarizer(), buildFacts(org.name, end, cur, prev, anomalies));
  const s: Summary = { orgId: org.id, weekStart: addDays(end, -6), summary: r.summary, actions: r.actions, createdAt: new Date().toISOString() };
  await repo.saveSummary(s);
  return s;
}
