import { Card, DateRange, PageHead } from "@/components/ui";
import { load, type RangeParams } from "@/lib/data";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6am-8pm covers all seeded traffic

export default async function Calls({ searchParams }: { searchParams: RangeParams }) {
  const { from, to, m } = await load(searchParams);
  const { total, missed } = m.heatmap;
  const max = Math.max(1, ...missed.flat());
  return (
    <>
      <PageHead title="Calls heatmap"><DateRange from={from} to={to} path="/calls" /></PageHead>
      <Card title="Missed calls by weekday and hour (darker = more missed; UTC)">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            <thead><tr><th />{HOURS.map((h) => <th key={h} className="font-normal text-slate-500">{h}</th>)}</tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <tr key={d}>
                  <th className="pr-2 text-right font-normal text-slate-500">{DAYS[d]}</th>
                  {HOURS.map((h) => (
                    <td
                      key={h}
                      title={`${DAYS[d]} ${h}:00 - ${missed[d][h]} missed of ${total[d][h]} calls`}
                      className="h-8 w-8 rounded text-center tabular-nums"
                      style={{ background: `rgba(14,116,144,${0.06 + (missed[d][h] / max) * 0.9})`, color: missed[d][h] / max > 0.5 ? "#fff" : "#0f172a" }}
                    >
                      {missed[d][h] || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
