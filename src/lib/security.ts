import { createHmac, timingSafeEqual } from "node:crypto";

export const hmacHex = (secret: string, data: string) =>
  createHmac("sha256", secret).update(data).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const REPLAY_WINDOW_SEC = 300;

/** Webhook signature header value: `sha256=<hex hmac of "<timestamp>.<raw body>">`. */
export const signBody = (secret: string, body: string, ts: string | number) => `sha256=${hmacHex(secret, `${ts}.${body}`)}`;

/** Timestamp (unix seconds) must be within the replay window; the signature binds it to the body. */
export function verifySignature(
  secret: string, body: string, header: string | null, ts: string | null, nowSec = Date.now() / 1000,
): boolean {
  if (!header || !ts || !/^\d{1,12}$/.test(ts) || Math.abs(nowSec - Number(ts)) > REPLAY_WINDOW_SEC) return false;
  return safeEqual(signBody(secret, body, ts), header.trim());
}

/** Signed demo session cookie: `<orgId>.<expEpochSec>.<hmac>`. */
export function signSession(orgId: string, expSec: number, secret: string): string {
  const payload = `${orgId}.${expSec}`;
  return `${payload}.${hmacHex(secret, payload)}`;
}

export function verifySession(token: string | undefined, secret: string, nowSec = Date.now() / 1000): string | null {
  const parts = token?.split(".");
  if (!parts || parts.length !== 3) return null;
  const [orgId, exp, mac] = parts;
  if (!safeEqual(hmacHex(secret, `${orgId}.${exp}`), mac) || Number(exp) < nowSec) return null;
  return orgId;
}
