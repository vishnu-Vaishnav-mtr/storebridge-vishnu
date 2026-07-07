import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "green",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "green" | "blue" | "warning" | "danger";
}) {
  const tones = {
    green: "bg-green/15 text-green",
    blue: "bg-blue/15 text-blue",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-red-100",
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
