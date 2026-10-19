import { Card, DateRange, PageHead } from "@/components/ui";
import { fmt, load, type RangeParams } from "@/lib/data";

export default async function Funnel({ searchParams }: { searchParams: RangeParams }) {
  const { from, to, m } = await load(searchParams);
  const f = m.funnel;
  const stages = [["Leads", f.leads], ["Booked", f.bookings], ["Completed jobs", f.jobs]] as const;
  return (
    <>
      <PageHead title="Conversion funnel"><DateRange from={from} to={to} path="/funnel" /></PageHead>
      <Card title="Lead to booking to job (by contact)">
        <div className="space-y-4">
          {stages.map(([label, n], i) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums">{n}{i > 0 && ` (${fmt.pct(stages[i - 1][1] ? n / stages[i - 1][1] : null)} of previous)`}</span>
              </div>
              <div className="h-6 rounded bg-slate-100">
                <div className="h-6 rounded bg-brand" style={{ width: `${f.leads ? (n / f.leads) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-500">Overall lead-to-job conversion: {fmt.pct(f.leads ? f.jobs / f.leads : null)}</p>
      </Card>
    </>
  );
}
