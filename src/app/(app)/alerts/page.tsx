import { Card, DateRange, PageHead } from "@/components/ui";
import { load, type RangeParams } from "@/lib/data";

const NAMES = { answerRate: "Answer rate", leads: "Leads" };

export default async function Alerts({ searchParams }: { searchParams: RangeParams }) {
  const { from, to, alerts } = await load(searchParams);
  return (
    <>
      <PageHead title="Anomaly alerts"><DateRange from={from} to={to} path="/alerts" /></PageHead>
      <Card title="Rolling 14-day z-score, flagged at |z| >= 2.5">
        {alerts.length === 0 ? <p className="text-sm text-slate-500">No anomalies in this range.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {alerts.map((a) => {
              const rate = a.metric === "answerRate";
              const show = (x: number) => (rate ? `${(x * 100).toFixed(1)}%` : x.toFixed(0));
              return (
                <li key={a.date + a.metric} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${a.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{a.severity}</span>
                    <b>{a.date}</b> {NAMES[a.metric]} was {a.direction}: {show(a.value)} vs typical {show(a.baseline)}
                  </span>
                  <span className="tabular-nums text-slate-500">z = {a.z.toFixed(1)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
