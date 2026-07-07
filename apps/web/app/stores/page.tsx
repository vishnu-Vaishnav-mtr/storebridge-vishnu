import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import {
  WooConnectionForm,
  ShopifyConnectionForm,
  StoredConnectionActions,
} from "@/features/stores/connection-forms";
import { getWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const { organisation } = await getWorkspaceData();

  return (
    <AppShell
      title="Stores"
      subtitle="Add source and destination stores without editing code or environment files."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="WooCommerce source store"
            description="Connect with WooCommerce REST API credentials. Optional WordPress credentials unlock content and media checks."
          />
          <WooConnectionForm />
        </Card>
        <Card>
          <CardHeader
            title="Shopify destination store"
            description="Use OAuth or a custom app Admin API token. Saved tokens are never returned to the browser."
          />
          <ShopifyConnectionForm />
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {organisation.connections.map((connection) => (
          <Card key={connection.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green" />
                  <h2 className="text-lg font-semibold">{connection.name}</h2>
                </div>
                <p className="mt-2 text-sm text-muted">{connection.url}</p>
                <div className="mt-4 grid gap-2 text-sm text-muted">
                  <p>API version: {connection.apiVersion ?? "Default"}</p>
                  <p>
                    Last checked:{" "}
                    {connection.lastCheckedAt
                      ? new Date(connection.lastCheckedAt).toLocaleString()
                      : "Not checked yet"}
                  </p>
                </div>
                <StoredConnectionActions connectionId={connection.id} />
              </div>
              <StatusBadge status={connection.status} />
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
