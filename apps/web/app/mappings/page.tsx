import { AppShell } from "@/components/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { getWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MappingsPage() {
  const { organisation } = await getWorkspaceData();
  const migration = organisation.migrations[0];

  return (
    <AppShell
      title="Mappings"
      subtitle="Review saved category, attribute, status and metafield mapping rules."
    >
      <Card>
        <CardHeader
          title="Saved mapping rules"
          description="Mapping rules are scoped to your workspace and never shared across organisations."
        />
        <div className="grid gap-3">
          {(migration?.mappingRules ?? []).map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="font-semibold">{rule.ruleType}</p>
              <p className="mt-1 text-sm text-muted">
                {rule.sourceKey} → {rule.targetKey ?? rule.action}
              </p>
            </div>
          ))}
          {!migration?.mappingRules.length ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-center">
              <p className="font-semibold">No mapping rules saved yet.</p>
              <p className="mt-1 text-sm text-muted">
                Create rules in the New Migration wizard.
              </p>
            </div>
          ) : null}
        </div>
      </Card>
    </AppShell>
  );
}
