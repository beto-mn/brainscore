"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ActivationChartProps {
  timeline: number[];
  durationS: number;
}

export function ActivationChart({ timeline, durationS }: ActivationChartProps) {
  const secondsPerPoint = timeline.length > 0 ? durationS / timeline.length : 0;
  const data = timeline.map((value, index) => ({
    time: Number((index * secondsPerPoint).toFixed(1)),
    value,
  }));

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="mb-2 text-sm font-medium text-slate-300">Estimated brain activity over the video</p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => `${Math.round(value)}s`}
              label={{ value: "Time (s)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 11 }}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 10 }}
              label={{
                value: "Predicted activation (a.u.)",
                angle: -90,
                position: "insideLeft",
                fill: "#64748b",
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(value: number) => [value.toFixed(4), "Activation"]}
              labelFormatter={(value: number) => `t = ${value.toFixed(1)}s`}
            />
            <Line type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[10px] text-slate-600">
        Mean predicted response across ~20k fsaverage5 vertices per time bin — arbitrary model units, not a
        standardized physical unit.
      </p>
    </div>
  );
}
