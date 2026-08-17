import type { AnalysisStats } from "@/lib/types";

interface StatsCardsProps {
  stats: AnalysisStats;
  durationS: number;
}

export function StatsCards({ stats, durationS }: StatsCardsProps) {
  const items = [
    { label: "Duration", value: `${durationS.toFixed(1)}s` },
    { label: "Mean activation", value: stats.mean_activation.toFixed(4) },
    { label: "Standard deviation", value: stats.std_activation.toFixed(4) },
    { label: "Max activation", value: stats.max_activation.toFixed(4) },
    { label: "Min activation", value: stats.min_activation.toFixed(4) },
    { label: "Timesteps", value: stats.n_timesteps.toLocaleString("en-US") },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
