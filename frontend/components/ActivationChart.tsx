"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ActivationChartProps {
  timeline: number[];
}

export function ActivationChart({ timeline }: ActivationChartProps) {
  const data = timeline.map((value, index) => ({ index, value }));

  return (
    <div className="h-64 w-full rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="mb-2 text-sm font-medium text-slate-300">Estimated brain activity over the video</p>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis dataKey="index" stroke="#64748b" tick={{ fontSize: 10 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
            labelStyle={{ color: "#94a3b8" }}
          />
          <Line type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
