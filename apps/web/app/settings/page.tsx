import { Lock, Moon, SlidersHorizontal, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="Configure defaults, security controls and appearance."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Migration defaults" />
          <SettingsField
            label="Default duplicate strategy"
            value="Skip existing records"
            icon={SlidersHorizontal}
          />
          <SettingsField
            label="Default batch size"
            value="25"
            icon={SlidersHorizontal}
          />
          <SettingsField
            label="Maximum retries"
            value="3"
            icon={SlidersHorizontal}
          />
          <SettingsField
            label="Auto-pause error threshold"
            value="10%"
            icon={SlidersHorizontal}
          />
        </Card>
        <Card>
          <CardHeader title="Security" />
          <SettingsField
            label="Active sessions"
            value="Current browser"
            icon={Lock}
          />
          <SettingsField
            label="Rotate credentials"
            value="Available per store"
            icon={Lock}
          />
          <Button variant="danger" className="mt-4">
            <Trash2 className="h-4 w-4" /> Delete workspace data
          </Button>
        </Card>
        <Card>
          <CardHeader title="Appearance" />
          <SettingsField label="Theme" value="Dark mode default" icon={Moon} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {["Dark", "Light", "System"].map((mode) => (
              <button
                key={mode}
                className="focus-ring rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
              >
                {mode}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function SettingsField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Lock;
}) {
  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon className="h-4 w-4 text-green" /> {label}
      </div>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}
