import { NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Headers: X-Org-Id, X-Timestamp (unix sec), X-Signature (sha256=<hmac of "ts.rawBody">), Idempotency-Key. */
export async function POST(req: Request) {
  const { status, body } = await ingest(getRepo(), {
    orgId: req.headers.get("x-org-id"),
    rawBody: await req.text(),
    signature: req.headers.get("x-signature"),
    timestamp: req.headers.get("x-timestamp"),
    idempotencyKey: req.headers.get("idempotency-key"),
  });
  return NextResponse.json(body, { status });
}
