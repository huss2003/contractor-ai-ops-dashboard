import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, verifySession } from "./security";

export const COOKIE = "session";
const isDemo = () => process.env.DEMO_MODE === "true";

/** Demo auth: a signed, expiring org cookie. Swap for Supabase Auth in production (see README). */
export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (isDemo()) return "demo-only-session-secret";
  throw new Error("SESSION_SECRET is required when DEMO_MODE is not true");
}

export const demoPassword = () => process.env.DEMO_PASSWORD ?? (isDemo() ? "demo" : null);

export const makeSession = (orgId: string) => signSession(orgId, Math.floor(Date.now() / 1000) + 7 * 86400, sessionSecret());

export function currentOrgId(): string {
  const id = verifySession(cookies().get(COOKIE)?.value, sessionSecret());
  if (!id) redirect("/login");
  return id;
}
