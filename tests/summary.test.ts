import { describe, expect, it } from "vitest";
import { buildFacts, generateSummary, guardNumbers, templateSummary, type Summarizer, type SummaryFacts } from "../src/lib/summary";
import { computeMetrics } from "../src/lib/metrics";
import { generateEvents, DEMO_ORGS } from "../src/lib/seed";

const now = new Date("2026-10-19T12:00:00Z");
const events = generateEvents(DEMO_ORGS[0], now).map((e, i) => ({ ...e, id: String(i) }));
const facts: SummaryFacts = buildFacts(
  "Summit HVAC", "2026-10-18",
  computeMetrics(events, "2026-10-12", "2026-10-18"),
  computeMetrics(events, "2026-10-05", "2026-10-11"),
  [],
);

describe("number guard", () => {
  it("accepts the deterministic template (only input numbers)", () => {
    expect(guardNumbers(templateSummary(facts), facts)).toEqual({ ok: true, unknown: [] });
  });

  it("accepts natural rounding and thousands separators", () => {
    const f = { ...facts, thisWeek: { ...facts.thisWeek, answerRatePct: 82.4, revenue: 12450 } };
    const r = { summary: "We answered 82% of calls and booked $12,450 in revenue.", actions: ["a", "b", "c"] };
    expect(guardNumbers(r, f).ok).toBe(true);
  });

  it("rejects an invented number", () => {
    const r = { summary: "Revenue grew 9999% this week.", actions: ["a", "b", "c"] };
    expect(guardNumbers(r, facts)).toEqual({ ok: false, unknown: ["9999"] });
  });

  it("checks the actions too", () => {
    const r = { summary: "Fine.", actions: ["Call 424242 leads", "b", "c"] };
    expect(guardNumbers(r, facts).unknown).toEqual(["424242"]);
  });
});

describe("generateSummary", () => {
  const liar: Summarizer = { summarize: async () => ({ summary: "Revenue hit 987654321 dollars.", actions: ["a", "b", "c"] }) };
  const honest: Summarizer = { summarize: async () => ({ summary: `We got ${facts.thisWeek.leads} leads.`, actions: ["a", "b", "c"] }) };
  const broken: Summarizer = { summarize: async () => { throw new Error("api down"); } };

  it("uses a clean LLM answer", async () => {
    expect((await generateSummary(honest, facts)).source).toBe("llm");
  });

  it("falls back to the template when the model invents numbers or errors", async () => {
    for (const s of [liar, broken]) {
      const r = await generateSummary(s, facts);
      expect(r.source).toBe("fallback");
      expect(r.actions).toHaveLength(3);
      expect(guardNumbers(r, facts).ok).toBe(true);
    }
  });
});

describe("seed data", () => {
  it("produces 90 days of plausible HVAC metrics with the planted anomalies", async () => {
    const { detectAnomalies } = await import("../src/lib/anomaly");
    const { dailySeries } = await import("../src/lib/metrics");
    const m = computeMetrics(events, "2026-07-22", "2026-10-19");
    expect(events.length).toBeGreaterThan(4000);
    expect(m.kpis.answerRate).toBeGreaterThan(0.6);
    expect(m.kpis.answerRate).toBeLessThan(0.9);
    expect(m.kpis.recoveryRate).toBeGreaterThan(0.1);
    expect(m.funnel.leads).toBeGreaterThan(m.funnel.bookings);
    expect(m.funnel.bookings).toBeGreaterThan(m.funnel.jobs);
    expect(detectAnomalies(dailySeries(events, "2026-07-22", "2026-10-19")).length).toBeGreaterThan(0);
  });
});
