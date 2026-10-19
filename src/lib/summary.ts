import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { addDays, type Metrics } from "./metrics";
import type { Anomaly } from "./anomaly";

/** Every number the model may mention. Rates are percentages, money is whole dollars. */
export interface SummaryFacts {
  org: string;
  week: { start: string; end: string };
  thisWeek: Snapshot;
  lastWeek: Snapshot;
  change: { answerRatePts: number | null; leadsPct: number | null; revenuePct: number | null };
  topSource: { name: string; leads: number; revenue: number } | null;
  alerts: { date: string; metric: string; value: number; typical: number }[];
}
interface Snapshot {
  calls: number; missedCalls: number; answerRatePct: number | null; recoveredContacts: number;
  recoveryRatePct: number | null; revenueRecovered: number; leads: number; bookings: number;
  revenue: number; medianSpeedToLeadMin: number | null;
}
export interface SummaryResult { summary: string; actions: string[] }
export interface Summarizer { summarize(facts: SummaryFacts): Promise<SummaryResult> }

const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
const pct = (x: number | null) => (x === null ? null : r1(x * 100));
const snap = (m: Metrics): Snapshot => ({
  calls: m.kpis.calls, missedCalls: m.kpis.missed, answerRatePct: pct(m.kpis.answerRate),
  recoveredContacts: m.kpis.recoveredContacts, recoveryRatePct: pct(m.kpis.recoveryRate),
  revenueRecovered: Math.round(m.kpis.revenueRecovered), leads: m.kpis.leads, bookings: m.kpis.bookings,
  revenue: Math.round(m.kpis.revenue), medianSpeedToLeadMin: r1(m.kpis.medianSpeedToLeadMin),
});
const change = (a: number, b: number) => (b ? r1(Math.abs(((a - b) / b) * 100)) : null);

export function buildFacts(org: string, end: string, cur: Metrics, prev: Metrics, anomalies: Anomaly[]): SummaryFacts {
  const [a, b] = [snap(cur), snap(prev)];
  const top = cur.sources[0];
  return {
    org,
    week: { start: addDays(end, -6), end },
    thisWeek: a,
    lastWeek: b,
    change: {
      answerRatePts: a.answerRatePct !== null && b.answerRatePct !== null ? r1(Math.abs(a.answerRatePct - b.answerRatePct)) : null,
      leadsPct: change(a.leads, b.leads),
      revenuePct: change(a.revenue, b.revenue),
    },
    topSource: top ? { name: top.source, leads: top.leads, revenue: Math.round(top.revenue) } : null,
    alerts: anomalies.slice(0, 3).map((x) => ({
      date: x.date, metric: x.metric,
      value: x.metric === "answerRate" ? r1(x.value * 100)! : x.value,
      typical: x.metric === "answerRate" ? r1(x.baseline * 100)! : r1(x.baseline)!,
    })),
  };
}

// ---- Number guard: every numeric token in the output must come from the input. ----
const NUM = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const norm = (s: string | number) => String(Number(String(s).replace(/,/g, "")));
export const numbersIn = (text: string) => (text.match(NUM) ?? []).map(norm);

export function allowedNumbers(facts: SummaryFacts): Set<string> {
  const ok = new Set<string>();
  for (const t of numbersIn(JSON.stringify(facts))) {
    const n = Number(t);
    // Allow natural rounding of a provided figure (82.4 -> 82), never new arithmetic.
    [n, Math.round(n), Math.round(n * 10) / 10].forEach((v) => ok.add(norm(v)));
  }
  return ok;
}

export function guardNumbers(result: SummaryResult, facts: SummaryFacts): { ok: boolean; unknown: string[] } {
  const allowed = allowedNumbers(facts);
  const unknown = numbersIn([result.summary, ...result.actions].join("\n")).filter((n) => !allowed.has(n));
  return { ok: unknown.length === 0, unknown };
}

/** Deterministic summary built only from facts. Used by the mock and as the guard-failure fallback. */
export function templateSummary(f: SummaryFacts): SummaryResult {
  const t = f.thisWeek, l = f.lastWeek;
  const $ = (n: number) => `$${n.toLocaleString("en-US")}`;
  const dir = (a: number | null, b: number | null) => (a === null || b === null ? "flat" : a >= b ? "up" : "down");
  const summary =
    `Week of ${f.week.start} to ${f.week.end}: ${f.org} answered ${t.answerRatePct ?? 0}% of ${t.calls} calls ` +
    `(${dir(t.answerRatePct, l.answerRatePct)} from ${l.answerRatePct ?? 0}% the week before). ` +
    `${t.missedCalls} calls were missed and ${t.recoveredContacts} of those callers were won back, worth ${$(t.revenueRecovered)}. ` +
    `Leads were ${dir(t.leads, l.leads)} at ${t.leads} with ${t.bookings} bookings and ${$(t.revenue)} in completed revenue.` +
    (f.topSource ? ` ${f.topSource.name} was the top source with ${f.topSource.leads} leads and ${$(f.topSource.revenue)} revenue.` : "") +
    (f.alerts.length ? ` ${f.alerts.length} anomalies were flagged; the latest was on ${f.alerts[0].date}.` : "");
  return {
    summary,
    actions: [
      `Cover the busiest missed-call windows: ${t.missedCalls} missed calls last week is revenue left on the table. Check the Calls heatmap and add after-hours or lunch coverage.`,
      `Keep the missed-call text-back fast: median speed to lead was ${t.medianSpeedToLeadMin ?? 0} minutes. Aim to reply to every new lead before that number grows.`,
      f.topSource
        ? `Double down on ${f.topSource.name}, which produced ${$(f.topSource.revenue)} in revenue, and review the weakest source on the Sources page.`
        : "Tag every lead with a source so you can see which channels pay back.",
    ],
  };
}

export class MockSummarizer implements Summarizer {
  async summarize(f: SummaryFacts) { return templateSummary(f); }
}

const outSchema = z.object({ summary: z.string().min(1), actions: z.array(z.string().min(1)).length(3) });

export class AnthropicSummarizer implements Summarizer {
  private client: Anthropic;
  constructor(apiKey: string, private model = "claude-sonnet-4-5") { this.client = new Anthropic({ apiKey }); }
  async summarize(facts: SummaryFacts) {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 700,
      system:
        "You write weekly summaries for a home-service business owner. Use plain English, no jargon. " +
        "Use ONLY numbers that appear in the JSON facts; never calculate, estimate or invent any number. " +
        "Do not number the actions. Reply with JSON only: {\"summary\": string (3-5 sentences), \"actions\": [string, string, string]}.",
      messages: [{ role: "user", content: JSON.stringify(facts) }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return outSchema.parse(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)));
  }
}

export function getSummarizer(): Summarizer {
  const { DEMO_MODE, ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = process.env;
  return DEMO_MODE === "true" || !ANTHROPIC_API_KEY ? new MockSummarizer() : new AnthropicSummarizer(ANTHROPIC_API_KEY, ANTHROPIC_MODEL);
}

/** Ask the model (up to 2 tries); anything that fails the number guard is discarded for the template. */
export async function generateSummary(s: Summarizer, facts: SummaryFacts): Promise<SummaryResult & { source: "llm" | "fallback" }> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await s.summarize(facts);
      if (guardNumbers(r, facts).ok) return { ...r, source: "llm" };
    } catch {
      /* retry, then fall back */
    }
  }
  return { ...templateSummary(facts), source: "fallback" };
}
