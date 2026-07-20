import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { requireCurrentMembership } from "@/lib/session";

export const dynamic = "force-dynamic";

const steps = [
  {
    title: "Prepare WooCommerce",
    items: [
      "WooCommerce > Settings > Advanced > REST API open karein.",
      "Read permission ke saath Consumer Key aur Secret banayein.",
      "Pages/posts bhi chahiye to WordPress Application Password rakhein.",
    ],
  },
  {
    title: "Prepare Shopify",
    items: [
      "Shopify custom app banakar Admin API access token copy karein.",
      "Products, customers, orders, content, files, inventory, locations aur redirects ki permissions dein.",
      "App ko store par install/reinstall karke latest permissions approve karein.",
    ],
  },
  {
    title: "Connect both stores",
    items: [
      "Stores page par WooCommerce details dal kar Test & Save karein.",
      "Shopify domain aur Admin API token dal kar Test & Save karein.",
      "Dono stores Connected dikhne ke baad hi migration banayein.",
    ],
  },
  {
    title: "Run migration",
    items: [
      "New Migration > Source Audit > Modules select karein.",
      "Dry Run complete karke warnings resolve karein; isme Shopify par write nahi hota.",
      "Start Migration ke baad Verify chalayein aur Reports check karein.",
    ],
  },
];

const shopifyScopes = [
  "write_products",
  "write_customers",
  "write_orders",
  "write_content",
  "write_files",
  "write_inventory",
  "read_locations",
  "write_online_store_navigation",
];

export default async function GuidePage() {
  await requireCurrentMembership();

  return (
    <AppShell
      title="Migration Guide"
      subtitle="Connect stores and migrate safely in four short steps."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {steps.map((step, index) => (
          <Card key={step.title}>
            <CardHeader title={`${index + 1}. ${step.title}`} />
            <div className="grid gap-2">
              {step.items.map((item) => (
                <p key={item} className="flex gap-2 text-sm leading-6 text-muted">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-green" />
                  {item}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Required Shopify scopes"
          description="Missing scope dikhe to custom app permissions update karke app reinstall karein."
        />
        <div className="flex flex-wrap gap-2">
          {shopifyScopes.map((scope) => (
            <code
              key={scope}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-green"
            >
              {scope}
            </code>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button href="/stores">Connect Stores</Button>
          <Button href="/new-migration" variant="secondary">
            Create Migration
          </Button>
        </div>
      </Card>
    </AppShell>
  );
}
