const styles: Record<string, string> = {
  CONNECTED: "border-green/30 bg-green/15 text-green",
  CONNECTED_WITH_WARNINGS: "border-warning/30 bg-warning/15 text-warning",
  PERMISSION_MISSING: "border-warning/30 bg-warning/15 text-warning",
  CONNECTION_FAILED: "border-danger/30 bg-danger/15 text-red-100",
  DISCONNECTED: "border-white/10 bg-white/8 text-muted",
  PAUSED: "border-paused/30 bg-paused/15 text-violet-200",
  RUNNING: "border-green/30 bg-green/15 text-green",
  VERIFIED: "border-green/30 bg-green/15 text-green",
  FAILED: "border-danger/30 bg-danger/15 text-red-100",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${styles[status] ?? "border-white/10 bg-white/8 text-muted"}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {status
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^\w/, (letter) => letter.toUpperCase())}
    </span>
  );
}
