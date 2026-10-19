import { z } from "zod";
import type { Repo } from "./repo";
import { verifySignature } from "./security";
import { EVENT_TYPES } from "./types";

const body = z
  .object({
    type: z.enum(EVENT_TYPES),
    occurred_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid timestamp").optional(),
    contact_id: z.string().min(1).max(100),
    source: z.string().max(40).optional(),
    value: z.number().nonnegative().max(1_000_000).optional(),
  })
  .refine((e) => e.type !== "job.completed" || e.value !== undefined, {
    message: "job.completed requires value",
    path: ["value"],
  });

export interface IngestRequest {
  orgId: string | null;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  idempotencyKey: string | null;
}

/** Verify -> validate -> insert. Pure of HTTP so it is unit-testable. */
export async function ingest(repo: Repo, req: IngestRequest): Promise<{ status: number; body: object }> {
  const org = req.orgId ? await repo.getOrg(req.orgId) : null;
  // Same response for unknown org and bad signature: no tenant enumeration.
  if (!org || !verifySignature(org.webhookSecret, req.rawBody, req.signature, req.timestamp)) {
    return { status: 401, body: { error: "invalid signature" } };
  }
  if (!req.idempotencyKey || req.idempotencyKey.length > 200) {
    return { status: 400, body: { error: "Idempotency-Key header required" } };
  }
  let json: unknown;
  try {
    json = JSON.parse(req.rawBody);
  } catch {
    return { status: 400, body: { error: "invalid JSON" } };
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return { status: 422, body: { error: parsed.error.issues.map((i) => i.message).join("; ") } };
  const e = parsed.data;
  const result = await repo.insertEvent({
    orgId: org.id,
    type: e.type,
    ts: new Date(e.occurred_at ?? Date.now()).toISOString(),
    contactId: e.contact_id,
    source: e.source,
    value: e.value,
    key: req.idempotencyKey,
  });
  return result === "created"
    ? { status: 201, body: { ok: true } }
    : { status: 200, body: { ok: true, duplicate: true } };
}
