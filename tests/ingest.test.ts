import { describe, expect, it } from "vitest";
import { ingest } from "../src/lib/ingest";
import { MemoryRepo } from "../src/lib/repo";
import { signBody, signSession, verifySession, verifySignature } from "../src/lib/security";

const orgs = [
  { id: "o1", name: "One", webhookSecret: "s1" },
  { id: "o2", name: "Two", webhookSecret: "s2" },
];
const body = JSON.stringify({ type: "lead.created", contact_id: "c1", source: "lsa", occurred_at: "2026-03-01T10:00:00Z" });
const TS = String(Math.floor(Date.now() / 1000));
const sign = (sec: string, b: string) => signBody(sec, b, TS);
const call = (repo: MemoryRepo, over: Partial<Parameters<typeof ingest>[1]> = {}) =>
  ingest(repo, { orgId: "o1", rawBody: body, signature: sign("s1", body), timestamp: TS, idempotencyKey: "k1", ...over });

describe("HMAC", () => {
  it("accepts the right signature and rejects tampering", () => {
    const v = (sec: string, b: string, h: string | null) => verifySignature(sec, b, h, "1000", 1000);
    expect(v("s", "abc", signBody("s", "abc", 1000))).toBe(true);
    expect(v("s", "abcd", signBody("s", "abc", 1000))).toBe(false);
    expect(v("other", "abc", signBody("s", "abc", 1000))).toBe(false);
    expect(v("s", "abc", null)).toBe(false);
    expect(v("s", "abc", "sha256=short")).toBe(false);
  });
  it("rejects missing, stale or re-stamped timestamps", () => {
    const h = signBody("s", "abc", 1000);
    expect(verifySignature("s", "abc", h, null, 1000)).toBe(false);
    expect(verifySignature("s", "abc", h, "1000", 1301)).toBe(false);
    expect(verifySignature("s", "abc", h, "1200", 1200)).toBe(false); // ts not covered by signature
    expect(verifySignature("s", "abc", h, "1000", 1299)).toBe(true);
  });
});

describe("ingest", () => {
  it("stores a valid signed event (201)", async () => {
    const repo = new MemoryRepo(orgs);
    expect((await call(repo)).status).toBe(201);
    expect(await repo.listEvents("o1", "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z")).toHaveLength(1);
  });

  it("rejects bad signature or unknown org with the same 401", async () => {
    const repo = new MemoryRepo(orgs);
    expect((await call(repo, { signature: sign("wrong", body) })).status).toBe(401);
    expect((await call(repo, { orgId: "nope" })).status).toBe(401);
    expect((await call(repo, { signature: null })).status).toBe(401);
  });

  it("is idempotent per org and key", async () => {
    const repo = new MemoryRepo(orgs);
    await call(repo);
    const again = await call(repo);
    expect(again).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(await repo.listEvents("o1", "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z")).toHaveLength(1);
    // same key under another org is a different event
    expect((await call(repo, { orgId: "o2", signature: sign("s2", body) })).status).toBe(201);
  });

  it("scopes events to the signing org", async () => {
    const repo = new MemoryRepo(orgs);
    await call(repo);
    expect(await repo.listEvents("o2", "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z")).toHaveLength(0);
  });

  it("requires an idempotency key and valid payloads", async () => {
    const repo = new MemoryRepo(orgs);
    expect((await call(repo, { idempotencyKey: null })).status).toBe(400);
    const noValue = JSON.stringify({ type: "job.completed", contact_id: "c1" });
    expect((await call(repo, { rawBody: noValue, signature: sign("s1", noValue) })).status).toBe(422);
    const badType = JSON.stringify({ type: "nope", contact_id: "c1" });
    expect((await call(repo, { rawBody: badType, signature: sign("s1", badType) })).status).toBe(422);
    const junk = "{not json";
    expect((await call(repo, { rawBody: junk, signature: sign("s1", junk) })).status).toBe(400);
  });
});

describe("session cookie", () => {
  it("round-trips, expires and detects tampering", () => {
    const t = signSession("o1", 2000, "k");
    expect(verifySession(t, "k", 1000)).toBe("o1");
    expect(verifySession(t, "k", 3000)).toBeNull();
    expect(verifySession(t.replace("o1", "o2"), "k", 1000)).toBeNull();
    expect(verifySession(undefined, "k")).toBeNull();
  });
});
