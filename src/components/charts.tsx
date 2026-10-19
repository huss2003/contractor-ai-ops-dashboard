"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Row = object;
interface Series { key: string; label: string; color: string }

const axis = { fontSize: 11, stroke: "#64748b" };

export function Trend({ data, series, unit = "" }: { data: Row[]; series: Series[]; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={axis} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
        <YAxis tick={axis} unit={unit} />
        <Tooltip />
        {series.length > 1 && <Legend />}
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} dot={false} strokeWidth={2} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, xKey, series }: { data: Row[]; xKey: string; series: Series[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={axis} />
        <YAxis tick={axis} />
        <Tooltip />
        <Legend />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
