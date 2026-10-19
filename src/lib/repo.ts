import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { DEMO_ORGS, generateEvents } from "./seed";
import type { Event, NewEvent, Org, Summary } from "./types";

/** Every read/write is scoped by org id: the only tenancy boundary the app code relies on. */
export interface Repo {
  getOrg(id: string): Promise<Org | null>;
  listOrgs(): Promise<Org[]>;
  insertEvent(e: NewEvent): Promise<"created" | "duplicate">;
  /** Events with from <= ts < to (ISO strings). */
  listEvents(orgId: string, from: string, to: string): Promise<Event[]>;
  saveSummary(s: Summary): Promise<void>;
  latestSummary(orgId: string): Promise<Summary | null>;
}

export class MemoryRepo implements Repo {
  private events: Event[] = [];
  private keys = new Set<string>();
  private summaries: Summary[] = [];
  constructor(private orgs: Org[], seed: NewEvent[] = []) {
    seed.forEach((e) => this.insertSync(e));
  }
  private insertSync(e: NewEvent) {
    const k = `${e.orgId}:${e.key}`;
    if (this.keys.has(k)) return "duplicate" as const;
    this.keys.add(k);
    this.events.push({ ...e, id: randomUUID() });
    return "created" as const;
  }
  async getOrg(id: string) { return this.orgs.find((o) => o.id === id) ?? null; }
  async listOrgs() { return this.orgs; }
  async insertEvent(e: NewEvent) { return this.insertSync(e); }
  async listEvents(orgId: string, from: string, to: string) {
    return this.events.filter((e) => e.orgId === orgId && e.ts >= from && e.ts < to);
  }
  async saveSummary(s: Summary) {
    this.summaries = this.summaries.filter((x) => !(x.orgId === s.orgId && x.weekStart === s.weekStart));
    this.summaries.push(s);
  }
  async latestSummary(orgId: string) {
    return this.summaries.filter((s) => s.orgId === orgId).sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0] ?? null;
  }
}

/** Server-side only (service role). Browser clients would rely on the RLS policies in supabase/schema.sql. */
export class SupabaseRepo implements Repo {
  private db: SupabaseClient;
  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  private static org = (r: { id: string; name: string; webhook_secret: string }): Org => ({ id: r.id, name: r.name, webhookSecret: r.webhook_secret });

  async getOrg(id: string) {
    const { data } = await this.db.from("orgs").select("*").eq("id", id).maybeSingle();
    return data ? SupabaseRepo.org(data) : null;
  }
  async listOrgs() {
    const { data, error } = await this.db.from("orgs").select("*");
    if (error) throw error;
    return (data ?? []).map(SupabaseRepo.org);
  }
  async insertEvent(e: NewEvent) {
    const { data, error } = await this.db
      .from("events")
      .upsert(
        { org_id: e.orgId, type: e.type, occurred_at: e.ts, contact_id: e.contactId, source: e.source ?? null, value: e.value ?? null, idempotency_key: e.key },
        { onConflict: "org_id,idempotency_key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw error;
    return data?.length ? "created" : "duplicate";
  }
  async listEvents(orgId: string, from: string, to: string) {
    const out: Event[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await this.db
        .from("events").select("*").eq("org_id", orgId).gte("occurred_at", from).lt("occurred_at", to)
        .order("occurred_at").range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      for (const r of data ?? []) {
        out.push({ id: r.id, orgId: r.org_id, type: r.type, ts: new Date(r.occurred_at).toISOString(), contactId: r.contact_id, source: r.source ?? undefined, value: r.value === null ? undefined : Number(r.value), key: r.idempotency_key });
      }
      if (!data || data.length < 1000) return out;
    }
  }
  async saveSummary(s: Summary) {
    const { error } = await this.db.from("weekly_summaries").upsert({ org_id: s.orgId, week_start: s.weekStart, summary: s.summary, actions: s.actions, created_at: s.createdAt });
    if (error) throw error;
  }
  async latestSummary(orgId: string) {
    const { data } = await this.db.from("weekly_summaries").select("*").eq("org_id", orgId).order("week_start", { ascending: false }).limit(1).maybeSingle();
    return data ? { orgId, weekStart: data.week_start, summary: data.summary, actions: data.actions, createdAt: data.created_at } : null;
  }
}

const g = globalThis as unknown as { __repo?: Repo };

/** Supabase when configured, otherwise a seeded in-memory store (resets on cold start). */
export function getRepo(): Repo {
  if (!g.__repo) {
    const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
    g.__repo = url && key
      ? new SupabaseRepo(url, key)
      : new MemoryRepo(DEMO_ORGS, DEMO_ORGS.flatMap((o, i) => generateEvents(o, new Date(), { scale: i === 0 ? 1 : 0.4, seed: 42 + i })));
  }
  return g.__repo;
}
