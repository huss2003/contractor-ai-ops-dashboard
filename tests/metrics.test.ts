import { describe, expect, it } from "vitest";
import { computeMetrics, median, weekStart } from "../src/lib/metrics";
import { ev } from "./helpers";

const events = [
  // A: answered, lead (google), booking, job $500
  ev("call.answered", "2026-03-02T09:00:00Z", "A", { source: "google" }),
  ev("lead.created", "2026-03-02T09:05:00Z", "A", { source: "google" }),
  ev("sms.sent", "2026-03-02T09:15:00Z", "A"),
  ev("booking.created", "2026-03-02T10:00:00Z", "A"),
  ev("job.completed", "2026-03-03T10:00:00Z", "A", { value: 500 }),
  // B: missed, texted back in 2 min, recovered -> booking -> job $300
  ev("call.missed", "2026-03-03T18:00:00Z", "B", { source: "lsa" }),
  ev("sms.sent", "2026-03-03T18:02:00Z", "B"),
  ev("lead.created", "2026-03-03T18:10:00Z", "B", { source: "lsa" }),
  ev("booking.created", "2026-03-04T08:00:00Z", "B"),
  ev("job.completed", "2026-03-05T08:00:00Z", "B", { value: 300 }),
  // C: missed, never recovered
  ev("call.missed", "2026-03-04T12:00:00Z", "C", { source: "lsa" }),
  // D: lead only, no response
  ev("lead.created", "2026-03-04T13:00:00Z", "D", { source: "google" }),
  ev("review.requested", "2026-03-05T10:00:00Z", "A"),
];

describe("computeMetrics", () => {
  const m = computeMetrics(events, "2026-03-01", "2026-03-07");

  it("answer rate = answered / all calls", () => {
    expect(m.kpis).toMatchObject({ calls: 3, answered: 1, missed: 2 });
    expect(m.kpis.answerRate).toBeCloseTo(1 / 3);
  });

  it("missed-call recovery and revenue recovered", () => {
    expect(m.kpis.missedContacts).toBe(2);
    expect(m.kpis.recoveredContacts).toBe(1);
    expect(m.kpis.recoveryRate).toBe(0.5);
    expect(m.kpis.revenueRecovered).toBe(300);
  });

  it("does not count a booking after the 7-day recovery window", () => {
    const late = [ev("call.missed", "2026-03-01T10:00:00Z", "Z"), ev("booking.created", "2026-03-10T10:00:00Z", "Z")];
    expect(computeMetrics(late, "2026-03-01", "2026-03-15").kpis.recoveredContacts).toBe(0);
  });

  it("median speed to lead (minutes from first touch to first SMS)", () => {
    // A: lead 09:05 -> sms 09:15 = 10; B: miss 18:00 -> sms 18:02 = 2; median of [10, 2] = 6
    expect(m.kpis.medianSpeedToLeadMin).toBe(6);
    expect(median([5, 1, 9])).toBe(5);
    expect(median([])).toBeNull();
  });

  it("funnel counts contacts through each stage", () => {
    expect(m.funnel).toEqual({ leads: 3, bookings: 2, jobs: 2 });
  });

  it("revenue by source and conversion", () => {
    const g = m.sources.find((s) => s.source === "google")!;
    expect(g).toMatchObject({ leads: 2, bookings: 1, jobs: 1, revenue: 500 });
    expect(g.conversion).toBe(0.5);
    expect(m.kpis.revenue).toBe(800);
    expect(m.kpis.reviewRequests).toBe(1);
  });

  it("daily is zero-filled and weekly rolls up to Monday", () => {
    expect(m.daily).toHaveLength(7);
    expect(m.weekly).toHaveLength(2); // Sun 03-01 belongs to the prior ISO week
    expect(weekStart("2026-03-04")).toBe("2026-03-02");
    expect(m.weekly.reduce((s, w) => s + w.revenue, 0)).toBe(800);
  });

  it("heatmap buckets by UTC weekday and hour", () => {
    expect(m.heatmap.missed[2][18]).toBe(1); // Tue 18:00
    expect(m.heatmap.total[1][9]).toBe(1); // Mon 09:00
  });

  it("respects the date range", () => {
    expect(computeMetrics(events, "2026-03-04", "2026-03-04").kpis.calls).toBe(1);
  });
});
