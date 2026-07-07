import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileSearch,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

const steps = [
  "Select Stores",
  "Scan Source",
  "Select Data",
  "Configure Mapping",
  "Review Warnings",
  "Dry Run",
  "Migrate",
  "Verify",
];
const modules = [
  "Products and variants",
  "Collections",
  "Inventory",
  "Product images",
  "Customers",
  "Customer addresses",
  "Orders",
  "Refunds",
  "Discounts and coupons",
  "Pages",
  "Blog posts",
  "Media library",
  "Product reviews",
  "Metafields",
  "SEO data",
  "URL redirects",
  "Custom post types",
  "Custom fields",
];

export default async function NewMigrationPage() {
  const { organisation, readiness } = await getWorkspaceData();
  const migration = organisation.migrations[0];

  return (
    <AppShell
      title="New Migration"
      subtitle="A guided eight-step workflow from connection checks to final verification."
    >
      <Card>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          {steps.map((step, index) => {
            const current = index + 1 === (migration?.currentStep ?? 1);
            const complete = index + 1 < (migration?.currentStep ?? 1);
            return (
              <div
                key={step}
                className={`rounded-xl border p-3 ${current ? "border-green/40 bg-green/10" : complete ? "border-white/10 bg-white/8" : "border-white/10 bg-white/5"}`}
              >
                <div className="flex items-center gap-2">
                  {complete ? (
                    <CheckCircle2 className="h-4 w-4 text-green" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted" />
                  )}
                  <span className="text-xs text-muted">Step {index + 1}</span>
                </div>
                <p className="mt-2 text-sm font-semibold">{step}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader
            title="1. Select Stores"
            description="Connection checks must pass before migration can continue."
          />
          <div className="grid gap-3">
            {organisation.connections.map((connection) => (
              <label
                key={connection.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <span>
                  <span className="block font-semibold">{connection.name}</span>
                  <span className="block text-sm text-muted">
                    {connection.platform}
                  </span>
                </span>
                <input
                  type="radio"
                  name={
                    connection.platform.includes("SHOPIFY")
                      ? "target"
                      : "source"
                  }
                  className="h-4 w-4 accent-green"
                />
              </label>
            ))}
            {organisation.connections.length === 0 ? (
              <p className="text-sm text-muted">
                Connect a WooCommerce source and Shopify destination first.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="2. Source Store Audit"
            description="The source scan is read-only and never modifies WooCommerce."
          />
          <div className="mb-4 rounded-xl border border-green/30 bg-green/10 p-4">
            <p className="text-sm text-muted">Data-readiness score</p>
            <p className="mt-1 text-3xl font-semibold text-green">
              {readiness}%
            </p>
          </div>
          <div className="grid gap-3">
            {(migration?.auditResults ?? []).map((result) => (
              <details
                key={result.id}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <summary className="cursor-pointer font-semibold">
                  {result.entityType}: {result.detectedCount} detected
                </summary>
                <div className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-4">
                  <span>{result.supportedCount} ready</span>
                  <span>{result.needsMapping} need mapping</span>
                  <span>{result.warningCount} warnings</span>
                  <span>{result.unsupportedCount} unsupported</span>
                </div>
              </details>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="3. Select Data"
            description="Dependencies are enforced automatically when a module requires another module."
          />
          <div className="mb-4 flex flex-wrap gap-3">
            <Button variant="secondary">Select all supported data</Button>
            <Button variant="ghost">Clear selection</Button>
            <Button variant="ghost">Use recommended selection</Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {modules.map((module) => (
              <label
                key={module}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  defaultChecked={[
                    "Products and variants",
                    "Product images",
                    "Customers",
                    "Orders",
                    "URL redirects",
                  ].includes(module)}
                  className="h-4 w-4 accent-green"
                />
                {module}
              </label>
            ))}
          </div>
        </Card>

        <Card id="mapping">
          <CardHeader
            title="4. Data Mapping"
            description="Map source structures to Shopify without changing source data."
          />
          <div className="grid gap-4">
            {[
              [
                "WooCommerce category",
                "Shopify collection",
                "Create new collection",
              ],
              [
                "Product attribute",
                "Shopify product option",
                "Use automatic mapping",
              ],
              [
                "WooCommerce meta key",
                "Shopify metafield",
                "Namespace: storebridge",
              ],
              [
                "Order status",
                "Historical order note",
                "Preserve source status",
              ],
              ["Coupon rule", "Shopify discount", "Report unsupported rules"],
            ].map(([source, destination, action]) => (
              <div
                key={source}
                className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-4 md:grid-cols-3"
              >
                <span>{source}</span>
                <span className="text-muted">→ {destination}</span>
                <span className="text-green">{action}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="5. Warnings and Compatibility" />
          <div className="space-y-3">
            {(migration?.errors ?? []).map((error) => (
              <div
                key={error.id}
                className="rounded-xl border border-warning/30 bg-warning/10 p-4"
              >
                <div className="flex items-center gap-2 font-semibold text-amber-100">
                  <AlertTriangle className="h-4 w-4" />{" "}
                  {error.name ?? error.entityType}
                </div>
                <p className="mt-2 text-sm text-muted">{error.message}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary">Resolve</Button>
                  <Button variant="ghost">Export issue</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="6. Dry Run and Import Files"
            description="Uploaded files are a fallback. API migration is recommended."
          />
          <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-6 text-center">
            <UploadCloud className="mx-auto h-8 w-8 text-green" />
            <p className="mt-3 font-semibold">
              Drag files here to validate before importing
            </p>
            <p className="mt-2 text-sm text-muted">
              CSV, WXR/XML, ZIP and JSON imports are checked by MIME type and
              content structure.
            </p>
          </div>
          <div className="mt-4 rounded-xl border border-green/30 bg-green/10 p-4">
            <FileSearch className="h-5 w-5 text-green" />
            <p className="mt-2 font-semibold">Ready with warnings</p>
            <p className="mt-1 text-sm text-muted">
              Run a dry migration to validate mappings, duplicates, media
              transfers and rate-limit risks.
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
