import type { Event } from "./types";

const DAY = 864e5;
const RECOVERY_WINDOW_MS = 7 * DAY;

export const dayOf = (ts: string) => ts.slice(0, 10);
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
export const weekStart = (d: string) => addDays(d, -((new Date(d).getUTCDay() + 6) % 7)); // Monday

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface DayRow {
  date: string; // day, or week start for weekly rows
  answered: number;
  missed: number;
  answerRate: number | null; // 0..1
  leads: number;
  bookings: number;
  jobs: number;
  revenue: number;
}

const blank = (date: string): DayRow => ({ date, answered: 0, missed: 0, answerRate: null, leads: 0, bookings: 0, jobs: 0, revenue: 0 });
const finish = (r: DayRow): DayRow => ({ ...r, answerRate: r.answered + r.missed ? r.answered / (r.answered + r.missed) : null });

/** One row per calendar day (zero-filled) between from..to inclusive. */
export function dailySeries(events: Event[], from: string, to: string): DayRow[] {
  const rows = new Map(daysBetween(from, to).map((d) => [d, blank(d)]));
  for (const e of events) {
    const r = rows.get(dayOf(e.ts));
    if (!r) continue;
    if (e.type === "call.answered") r.answered++;
    else if (e.type === "call.missed") r.missed++;
    else if (e.type === "lead.created") r.leads++;
    else if (e.type === "booking.created") r.bookings++;
    else if (e.type === "job.completed") {
      r.jobs++;
      r.revenue += e.value ?? 0;
    }
  }
  return [...rows.values()].map(finish);
}

export function weeklyRollup(daily: DayRow[]): DayRow[] {
  const weeks = new Map<string, DayRow>();
  for (const d of daily) {
    const k = weekStart(d.date);
    const w = weeks.get(k) ?? blank(k);
    for (const f of ["answered", "missed", "leads", "bookings", "jobs", "revenue"] as const) w[f] += d[f];
    weeks.set(k, w);
  }
  return [...weeks.values()].map(finish);
}

export interface SourceRow {
  source: string;
  leads: number;
  bookings: number;
  jobs: number;
  revenue: number;
  conversion: number; // leads -> completed job
}

export interface Metrics {
  kpis: {
    calls: number;
    answered: number;
    missed: number;
    answerRate: number | null;
    missedContacts: number;
    recoveredContacts: number;
    recoveryRate: number | null;
    revenueRecovered: number;
    revenue: number;
    leads: number;
    bookings: number;
    jobs: number;
    medianSpeedToLeadMin: number | null;
    reviewRequests: number;
  };
  daily: DayRow[];
  weekly: DayRow[];
  funnel: { leads: number; bookings: number; jobs: number };
  sources: SourceRow[];
  /** [weekday 0=Sun][hour 0-23] */
  heatmap: { total: number[][]; missed: number[][] };
}

const grid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));

/** All metric definitions live here (see README). from/to are inclusive YYYY-MM-DD (UTC). */
export function computeMetrics(all: Event[], from: string, to: string): Metrics {
  const events = all.filter((e) => dayOf(e.ts) >= from && dayOf(e.ts) <= to).sort((a, b) => a.ts.localeCompare(b.ts));
  const daily = dailySeries(events, from, to);
  const byContact = new Map<string, Event[]>();
  const heat = { total: grid(), missed: grid() };
  let reviewRequests = 0;
  for (const e of events) {
    (byContact.get(e.contactId) ?? byContact.set(e.contactId, []).get(e.contactId)!).push(e);
    if (e.type === "review.requested") reviewRequests++;
    if (e.type === "call.answered" || e.type === "call.missed") {
      const t = new Date(e.ts);
      heat.total[t.getUTCDay()][t.getUTCHours()]++;
      if (e.type === "call.missed") heat.missed[t.getUTCDay()][t.getUTCHours()]++;
    }
  }

  let missedContacts = 0, recovered = 0, revenueRecovered = 0;
  const speeds: number[] = [];
  const leadSource = new Map<string, string>();
  const booked = new Set<string>(), done = new Set<string>();
  const contactRevenue = new Map<string, number>();

  for (const [cid, evs] of byContact) {
    const first = (t: Event["type"], after = "") => evs.find((e) => e.type === t && e.ts >= after);
    const lead = first("lead.created");
    const booking = first("booking.created");
    const miss = first("call.missed");
    if (lead) leadSource.set(cid, lead.source ?? "unknown");
    if (booking) booked.add(cid);
    const jobs = evs.filter((e) => e.type === "job.completed");
    if (jobs.length) done.add(cid);
    contactRevenue.set(cid, jobs.reduce((s, j) => s + (j.value ?? 0), 0));

    // Speed to lead: first inbound touch (miss or lead) -> first SMS at/after it.
    const touch = [miss?.ts, lead?.ts].filter(Boolean).sort()[0];
    const sms = touch ? first("sms.sent", touch) : undefined;
    if (touch && sms) speeds.push((Date.parse(sms.ts) - Date.parse(touch)) / 6e4);

    if (miss) {
      missedContacts++;
      const win = Date.parse(miss.ts) + RECOVERY_WINDOW_MS;
      const rb = first("booking.created", miss.ts);
      if (rb && Date.parse(rb.ts) <= win) {
        recovered++;
        revenueRecovered += jobs.filter((j) => j.ts >= rb.ts).reduce((s, j) => s + (j.value ?? 0), 0);
      }
    }
  }

  const src = new Map<string, SourceRow>();
  for (const [cid, source] of leadSource) {
    const r = src.get(source) ?? { source, leads: 0, bookings: 0, jobs: 0, revenue: 0, conversion: 0 };
    r.leads++;
    if (booked.has(cid)) r.bookings++;
    if (booked.has(cid) && done.has(cid)) r.jobs++;
    r.revenue += contactRevenue.get(cid) ?? 0;
    src.set(source, r);
  }
  const sources = [...src.values()]
    .map((r) => ({ ...r, conversion: r.leads ? r.jobs / r.leads : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const sum = (f: "answered" | "missed" | "leads" | "bookings" | "jobs" | "revenue") => daily.reduce((s, d) => s + d[f], 0);
  const answered = sum("answered"), missed = sum("missed");
  return {
    kpis: {
      calls: answered + missed,
      answered,
      missed,
      answerRate: answered + missed ? answered / (answered + missed) : null,
      missedContacts,
      recoveredContacts: recovered,
      recoveryRate: missedContacts ? recovered / missedContacts : null,
      revenueRecovered,
      revenue: sum("revenue"),
      leads: leadSource.size,
      bookings: sum("bookings"),
      jobs: sum("jobs"),
      medianSpeedToLeadMin: median(speeds),
      reviewRequests,
    },
    daily,
    weekly: weeklyRollup(daily),
    funnel: {
      leads: leadSource.size,
      bookings: [...leadSource.keys()].filter((c) => booked.has(c)).length,
      jobs: [...leadSource.keys()].filter((c) => booked.has(c) && done.has(c)).length,
    },
    sources,
    heatmap: heat,
  };
}
