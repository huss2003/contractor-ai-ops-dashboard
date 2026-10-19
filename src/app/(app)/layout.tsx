import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { COOKIE, currentOrgId } from "@/lib/auth";
import { getRepo } from "@/lib/repo";

const NAV = [["/", "Overview"], ["/funnel", "Funnel"], ["/sources", "Sources"], ["/calls", "Calls"], ["/alerts", "Alerts"]];

async function logout() {
  "use server";
  cookies().delete(COOKIE);
  redirect("/login");
}

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const org = await getRepo().getOrg(currentOrgId());
  if (!org) redirect("/login");
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-brand">Contractor AI Ops</div>
          <div className="text-lg font-semibold">{org.name}</div>
        </div>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-3 py-1.5 hover:bg-slate-200">{label}</Link>
          ))}
          <form action={logout}><button className="rounded-md px-3 py-1.5 text-slate-500 hover:bg-slate-200">Sign out</button></form>
        </nav>
      </header>
      {children}
    </div>
  );
}
