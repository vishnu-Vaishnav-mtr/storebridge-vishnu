import { AppShell } from "@/components/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { requireCurrentMembership } from "@/lib/session";

export const dynamic = "force-dynamic";

const topics = [
  {
    title: "WooCommerce API keys",
    body: "Create read-only REST API keys in WooCommerce settings, then test the connection in Stores.",
  },
  {
    title: "Shopify custom app",
    body: "Grant the Admin API scopes shown in the Stores page before saving the destination connection.",
  },
  {
    title: "Pause and resume",
    body: "StoreBridge checkpoints each module so a migration can resume from the last completed record.",
  },
  {
    title: "Duplicate prevention",
    body: "Source IDs, destination IDs and hashes are persisted per workspace before reruns.",
  },
];

export default async function HelpPage() {
  await requireCurrentMembership();

  return (
    <AppShell title="Help" subtitle="Operational guidance for safe migrations.">
      <div className="grid gap-4 md:grid-cols-2">
        {topics.map((topic) => (
          <Card key={topic.title}>
            <CardHeader title={topic.title} />
            <p className="text-sm leading-6 text-muted">{topic.body}</p>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
