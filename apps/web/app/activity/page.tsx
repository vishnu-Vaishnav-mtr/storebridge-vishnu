import { AppShell } from "@/components/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { getWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const { organisation } = await getWorkspaceData();
  return (
    <AppShell
      title="Activity"
      subtitle="Sensitive actions are recorded for auditability."
    >
      <Card>
        <CardHeader title="Activity log" />
        <div className="space-y-3">
          {organisation.activityLogs.map((activity) => (
            <div
              key={activity.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="font-semibold">{activity.action}</p>
              <p className="mt-1 text-sm text-muted">{activity.message}</p>
              <p className="mt-2 text-xs text-muted">
                {new Date(activity.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
