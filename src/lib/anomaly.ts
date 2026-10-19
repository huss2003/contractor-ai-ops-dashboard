import type { DayRow } from "./metrics";

/**
 * Rolling z-score: each value is compared with the previous `window` non-null
 * values (current day excluded). Null until `minHistory` points exist or when
 * the history has zero variance.
 */
export function zScores(values: (number | null)[], window = 14, minHistory = 7): (number | null)[] {
  return values.map((v, i) => {
    if (v === null) return null;
    const hist = values.slice(Math.max(0, i - window), i).filter((x): x is number => x !== null);
    if (hist.length < minHistory) return null;
    const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
    const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length);
    return sd === 0 ? null : (v - mean) / sd;
  });
}

export interface Anomaly {
  date: string;
  metric: "answerRate" | "leads";
  value: number;
  baseline: number;
  z: number;
  direction: "low" | "high";
  severity: "warning" | "critical";
}

export function detectAnomalies(daily: DayRow[], threshold = 2.5): Anomaly[] {
  const out: Anomaly[] = [];
  const metrics = ["answerRate", "leads"] as const;
  for (const metric of metrics) {
    const vals = daily.map((d) => d[metric]);
    const zs = zScores(vals);
    zs.forEach((z, i) => {
      const value = vals[i];
      if (z === null || value === null || Math.abs(z) < threshold) return;
      // High answer rate is good news, not an alert.
      if (metric === "answerRate" && z > 0) return;
      const baseline = value - z * stdOf(vals, i);
      out.push({
        date: daily[i].date,
        metric,
        value,
        baseline,
        z,
        direction: z < 0 ? "low" : "high",
        severity: Math.abs(z) >= 3.5 ? "critical" : "warning",
      });
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// Recover the window std to report an expected value (mean) alongside the z.
function stdOf(vals: (number | null)[], i: number, window = 14): number {
  const hist = vals.slice(Math.max(0, i - window), i).filter((x): x is number => x !== null);
  const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
  return Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length);
}
