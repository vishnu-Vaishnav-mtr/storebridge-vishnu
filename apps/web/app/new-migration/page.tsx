import { AppShell } from "@/components/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { CreateMigrationPanel } from "@/features/migrations/create-migration-panel";
import { getWorkspaceData } from "@/lib/data";
import {
  isUsableConnection,
  migrationCreateAvailability,
} from "@/lib/migrations";

export const dynamic = "force-dynamic";

export default async function NewMigrationPage() {
  const { organisation } = await getWorkspaceData();
  const sources = organisation.connections.filter(
    (connection) =>
      connection.platform === "WOOCOMMERCE" && isUsableConnection(connection),
  );
  const destinations = organisation.connections.filter(
    (connection) =>
      connection.platform === "SHOPIFY" && isUsableConnection(connection),
  );
  const availability = migrationCreateAvailability(organisation.connections);

  return (
    <AppShell
      title="New Migration"
      subtitle="Create a migration draft once both store connections are ready."
    >
      <Card>
        <CardHeader
          title="Create migration"
          description="StoreBridge will create a scoped draft, default configuration and supported data modules, then open the setup wizard."
        />
        <CreateMigrationPanel
          sources={sources.map(toConnectionOption)}
          destinations={destinations.map(toConnectionOption)}
          message={availability.message}
        />
      </Card>
    </AppShell>
  );
}

function toConnectionOption(connection: {
  id: string;
  name: string;
  platform: string;
  status: string;
  url: string;
}) {
  return {
    id: connection.id,
    name: connection.name,
    platform: connection.platform,
    status: connection.status,
    url: connection.url,
  };
}
