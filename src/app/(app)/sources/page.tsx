import { Bars } from "@/components/charts";
import { Card, DateRange, PageHead } from "@/components/ui";
import { fmt, load, type RangeParams } from "@/lib/data";

export default async function Sources({ searchParams }: { searchParams: RangeParams }) {
  const { from, to, m } = await load(searchParams);
  return (
    <>
      <PageHead title="Lead sources"><DateRange from={from} to={to} path="/sources" /></PageHead>
      <div className="space-y-4">
        <Card title="Leads and completed jobs by source">
          <Bars data={m.sources} xKey="source" series={[{ key: "leads", label: "Leads", color: "#0e7490" }, { key: "jobs", label: "Jobs", color: "#d97706" }]} />
        </Card>
        <Card title="Source performance">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr>{["Source", "Leads", "Booked", "Jobs", "Conversion", "Revenue"].map((h) => <th key={h} className="py-1 pr-4">{h}</th>)}</tr></thead>
              <tbody className="tabular-nums">
                {m.sources.map((s) => (
                  <tr key={s.source} className="border-t border-slate-100">
                    <td className="py-1.5 pr-4 font-medium">{s.source}</td><td className="pr-4">{s.leads}</td><td className="pr-4">{s.bookings}</td>
                    <td className="pr-4">{s.jobs}</td><td className="pr-4">{fmt.pct(s.conversion)}</td><td>{fmt.usd(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
