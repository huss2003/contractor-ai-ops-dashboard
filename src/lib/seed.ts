import type { NewEvent, Org } from "./types";

export const DEMO_ORGS: Org[] = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Summit HVAC & Air", webhookSecret: "demo-secret-summit" },
  { id: "00000000-0000-0000-0000-000000000002", name: "Lakeside Plumbing", webhookSecret: "demo-secret-lakeside" },
];

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SOURCES: [string, number][] = [["google_ads", 0.3], ["lsa", 0.22], ["organic", 0.18], ["referral", 0.14], ["facebook", 0.08], ["yelp", 0.08]];
const HOURS = [1, 3, 6, 8, 9, 9, 7, 6, 7, 7, 6, 5, 4, 2, 1]; // weights for hours 6..20
const HSUM = HOURS.reduce((a, b) => a + b, 0);

/**
 * 90 days of plausible HVAC traffic: summer-heavy seasonality, weekday peaks,
 * weaker pickup at lunch/evenings/weekends, funnel drop-off per stage, plus two
 * planted anomalies (a staffing gap 12 days ago, a lead drought 5 days ago).
 */
export function generateEvents(org: Org, now: Date, opts: { days?: number; scale?: number; seed?: number } = {}): NewEvent[] {
  const { days = 90, scale = 1, seed = 42 } = opts;
  const rnd = mulberry32(seed);
  const pick = <T,>(w: [T, number][]) => { let r = rnd(), c = 0; for (const [v, p] of w) if (r < (c += p)) return v; return w[0][0]; };
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const out: NewEvent[] = [];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let n = 0;
  const emit = (type: NewEvent["type"], at: number, contactId: string, extra: Partial<NewEvent> = {}) => {
    if (at > now.getTime()) return false;
    out.push({ orgId: org.id, type, ts: new Date(at).toISOString(), contactId, key: `seed-${org.id.slice(-1)}-${n++}`, ...extra });
    return true;
  };
  const MIN = 6e4;

  /** lead -> (booking) -> (job) -> (review request) */
  const funnel = (cid: string, source: string, leadAt: number, bookP: number) => {
    if (!emit("lead.created", leadAt, cid, { source }) || rnd() > bookP) return;
    const bookAt = leadAt + between(10 * MIN, 40 * 36e5);
    if (!emit("booking.created", bookAt, cid, { source }) || rnd() > 0.88) return;
    const jobAt = bookAt + between(1, 5) * 864e5;
    const r = rnd();
    const value = Math.round(r < 0.18 ? between(129, 189) : r < 0.88 ? between(180, 650) : between(4500, 9500));
    if (emit("job.completed", jobAt, cid, { source, value }) && rnd() < 0.7) emit("review.requested", jobAt + between(0.5, 2) * 864e5, cid);
  };

  for (let d = days - 1; d >= 0; d--) {
    const dayMs = today - d * 864e5;
    const dt = new Date(dayMs);
    const dow = dt.getUTCDay();
    const doy = (dayMs - Date.UTC(dt.getUTCFullYear(), 0, 0)) / 864e5;
    const season = 1 + 0.35 * Math.cos((2 * Math.PI * (doy - 200)) / 365);
    const weekend = dow === 0 || dow === 6;
    const volume = scale * season * (weekend ? 0.55 : 1) * (d === 5 ? 0.35 : 1);
    const calls = Math.round(26 * volume * between(0.85, 1.15));
    for (let i = 0; i < calls; i++) {
      const hour = 6 + pick(HOURS.map((w, h) => [h, w / HSUM] as [number, number]));
      const at = dayMs + hour * 36e5 + between(0, 59) * MIN;
      const cid = `c${out.length}-${i}`;
      const source = pick(SOURCES);
      const pickup = d === 12 ? 0.45 : weekend ? 0.62 : hour === 12 ? 0.7 : hour >= 17 ? 0.6 : 0.88;
      if (rnd() < pickup) {
        emit("call.answered", at, cid, { source });
        if (rnd() < 0.5) {
          const leadAt = at + between(3, 20) * MIN;
          funnel(cid, source, leadAt, 0.62);
          if (rnd() < 0.9) emit("sms.sent", leadAt + between(1, 10) * MIN, cid);
        }
      } else {
        emit("call.missed", at, cid, { source });
        if (rnd() < 0.88) {
          const smsAt = at + between(10, 120) * 1000;
          emit("sms.sent", smsAt, cid);
          if (rnd() < 0.42) funnel(cid, source, smsAt + between(2, 40) * MIN, 0.55);
        }
      }
    }
    const web = Math.round(6 * volume * between(0.6, 1.4));
    for (let i = 0; i < web; i++) {
      const at = dayMs + between(7, 21) * 36e5;
      const cid = `w${out.length}-${i}`;
      funnel(cid, "website", at, 0.5);
      emit("sms.sent", at + between(1, rnd() < 0.2 ? 240 : 30) * MIN, cid);
    }
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}
