import { createHmac, timingSafeEqual } from "node:crypto";

export const hmacHex = (secret: string, data: string) =>
  createHmac("sha256", secret).update(data).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Webhook signature header value: `sha256=<hex hmac of the raw body>`. */
export const signBody = (secret: string, body: string) => `sha256=${hmacHex(secret, body)}`;

export function verifySignature(secret: string, body: string, header: string | null): boolean {
  return !!header && safeEqual(signBody(secret, body), header.trim());
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
