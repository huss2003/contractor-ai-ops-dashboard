import { describe, expect, it } from "vitest";
import { detectAnomalies, zScores } from "../src/lib/anomaly";
import type { DayRow } from "../src/lib/metrics";

const row = (i: number, answerRate: number | null, leads: number): DayRow => ({
  date: `2026-03-${String(i + 1).padStart(2, "0")}`, answered: 0, missed: 0, answerRate, leads, bookings: 0, jobs: 0, revenue: 0,
});

describe("zScores", () => {
  it("is null until enough history and when variance is zero", () => {
    expect(zScores([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 7)).toEqual(Array(7).fill(null));
    expect(zScores(Array(10).fill(5))[9]).toBeNull();
  });

  it("matches a hand computed value", () => {
    // history 1..7: mean 4, population sd 2; value 10 -> z = 3
    expect(zScores([1, 2, 3, 4, 5, 6, 7, 10])[7]).toBeCloseTo(3);
  });

  it("skips null days without breaking the window", () => {
    expect(zScores([1, null, 2, 3, 4, 5, 6, 7, 20])[8]).toBeGreaterThan(3);
  });
});

describe("detectAnomalies", () => {
  const base = Array.from({ length: 14 }, (_, i) => row(i, 0.85 + (i % 2) * 0.02, 10 + (i % 3)));

  it("flags a collapse in answer rate and a lead drought", () => {
    const found = detectAnomalies([...base, row(14, 0.4, 2)]);
    expect(found.map((a) => a.metric).sort()).toEqual(["answerRate", "leads"]);
    expect(found.every((a) => a.direction === "low" && a.severity === "critical")).toBe(true);
  });

  it("ignores a better-than-usual answer rate but flags a lead spike", () => {
    const found = detectAnomalies([...base, row(14, 0.99, 40)]);
    expect(found.map((a) => `${a.metric}:${a.direction}`)).toEqual(["leads:high"]);
  });

  it("is quiet on normal variation", () => {
    expect(detectAnomalies([...base, row(14, 0.86, 11)])).toEqual([]);
  });
});
