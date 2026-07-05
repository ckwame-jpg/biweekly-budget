// Recharts-backed chart bodies, split into their own chunk (lazy-loaded from
// App.jsx) since recharts is one of the two heaviest dependencies in the app.
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { C } from "../lib/theme.js";
import { fmt } from "../lib/format.js";

export function GoalBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, left: 4, bottom: 4 }}>
        <XAxis type="number" hide domain={[0, (dataMax) => Math.max(dataMax, 100) * 1.05]} />
        <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 12, fill: C.inkSoft }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(_v, _n, p) => [p.payload.raw, p.payload.name]} contentStyle={{ borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 12 }} />
        <ReferenceLine x={100} stroke={C.ink} strokeDasharray="3 3" label={{ value: "Goal", position: "insideTopRight", fontSize: 10, fill: C.muted }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
          {data.map((d, i) => <Cell key={i} fill={d.onTrack ? C.primary : C.gold} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendDonutChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="none">
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChart({ data, margin, yTickFormatter }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={margin}>
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: yTickFormatter ? 10 : 11, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={yTickFormatter} />
        <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 12 }} />
        <Bar dataKey="value" radius={[8, 8, 0, 0]}>{data.map((d, i) => <Cell key={i} fill={d.color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
