import Link from "next/link";
import { addDays } from "@/lib/metrics";

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

/** GET form + presets; the URL is the state so every view is shareable. */
export function DateRange({ from, to, path, grain }: { from: string; to: string; path: string; grain?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const preset = (n: number) => `${path}?from=${addDays(today, -(n - 1))}&to=${today}${grain ? `&grain=${grain}` : ""}`;
  return (
    <form method="get" action={path} className="flex flex-wrap items-center gap-2 text-sm">
      {[7, 30, 90].map((n) => (
        <Link key={n} href={preset(n)} className="rounded-md border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100">
          {n}d
        </Link>
      ))}
      <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-md border border-slate-300 px-2 py-1" />
      <span className="text-slate-400">to</span>
      <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-md border border-slate-300 px-2 py-1" />
      {grain && <input type="hidden" name="grain" value={grain} />}
      <button className="rounded-md bg-brand px-3 py-1 font-medium text-white">Apply</button>
    </form>
  );
}

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
