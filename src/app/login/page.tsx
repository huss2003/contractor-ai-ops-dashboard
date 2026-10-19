import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, demoPassword, makeSession } from "@/lib/auth";
import { safeEqual } from "@/lib/security";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

async function login(fd: FormData) {
  "use server";
  const pw = demoPassword();
  const org = await getRepo().getOrg(String(fd.get("org")));
  if (!pw || !org || !safeEqual(String(fd.get("password")), pw)) redirect("/login?error=1");
  cookies().set(COOKIE, makeSession(org.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 86400, path: "/" });
  redirect("/");
}

export default async function Login({ searchParams }: { searchParams: { error?: string } }) {
  const orgs = await getRepo().listOrgs();
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <form action={login} className="card space-y-3">
        <h1 className="text-lg font-semibold">Contractor AI Ops</h1>
        <p className="text-sm text-slate-500">Demo login. {process.env.DEMO_MODE === "true" && "Password: demo"}</p>
        <select name="org" className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm" aria-label="Organization">
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input name="password" type="password" required placeholder="Password" className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm" />
        {searchParams.error && <p className="text-sm text-red-600">Invalid credentials.</p>}
        <button className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white">Sign in</button>
      </form>
    </main>
  );
}
