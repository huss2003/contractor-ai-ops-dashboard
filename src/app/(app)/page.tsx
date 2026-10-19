import Link from "next/link";
import { Trend, Bars } from "@/components/charts";
import { Card, DateRange, Kpi, PageHead } from "@/components/ui";
import { fmt, load, type RangeParams } from "@/lib/data";
import { runWeekly } from "@/lib/weekly";

export default async function Overview({ searchParams }: { searchParams: RangeParams }) {
  const { repo, org, from, to, grain, m, alerts } = await load(searchParams);
  const k = m.kpis;
  const rows = (grain === "week" ? m.weekly : m.daily).map((d) => ({ ...d, answerPct: d.answerRate === null ? null : +(d.answerRate * 100).toFixed(1) }));
  // Demo/mock mode generates on first view; real LLM summaries come from the weekly cron.
  let summary = await repo.latestSummary(org.id);
  if (!summary && !process.env.ANTHROPIC_API_KEY) summary = await runWeekly(repo, org);
  const other = grain === "week" ? "day" : "week";
  const link = `/?from=${from}&to=${to}&grain=${other}`;

  return (
    <>
      <PageHead title="Overview">
        <DateRange from={from} to={to} path="/" grain={grain} />
      </PageHead>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Answer rate" value={fmt.pct(k.answerRate)} hint={`${k.answered} of ${k.calls} calls`} />
        <Kpi label="Missed-call recovery" value={fmt.pct(k.recoveryRate)} hint={`${k.recoveredContacts} of ${k.missedContacts} callers won back`} />
        <Kpi label="Revenue recovered" value={fmt.usd(k.revenueRecovered)} hint="from missed callers who booked" />
        <Kpi label="Speed to lead" value={fmt.min(k.medianSpeedToLeadMin)} hint="median first response" />
        <Kpi label="Leads" value={String(k.leads)} />
        <Kpi label="Bookings" value={String(k.bookings)} />
        <Kpi label="Revenue" value={fmt.usd(k.revenue)} hint={`${k.jobs} jobs completed`} />
        <Kpi label="Review requests" value={String(k.reviewRequests)} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title={`Answer rate (%) by ${grain}`}><Trend data={rows} unit="%" series={[{ key: "answerPct", label: "Answer rate", color: "#0e7490" }]} /></Card>
        <Card title={`Leads and bookings by ${grain}`}>
          <Trend data={rows} series={[{ key: "leads", label: "Leads", color: "#0e7490" }, { key: "bookings", label: "Bookings", color: "#d97706" }]} />
        </Card>
        <Card title={`Revenue ($) by ${grain}`}><Bars data={rows} xKey="date" series={[{ key: "revenue", label: "Revenue", color: "#16a34a" }]} /></Card>
        <Card title="AI weekly summary">
          {summary ? (
            <div className="space-y-3 text-sm leading-relaxed">
              <p>{summary.summary}</p>
              <ol className="list-decimal space-y-1 pl-5">{summary.actions.map((a) => <li key={a}>{a}</li>)}</ol>
              <p className="text-xs text-slate-500">Week of {summary.weekStart}. Every number is checked against the computed metrics.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No summary yet. The weekly cron generates one every Monday.</p>
          )}
        </Card>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        <Link className="underline" href={link}>Switch to {other}ly view</Link> · {alerts.length} anomalies in range, see <Link className="underline" href="/alerts">Alerts</Link>.
      </p>
    </>
  );
}
