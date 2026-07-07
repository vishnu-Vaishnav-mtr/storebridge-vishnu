"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, GitBranch, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";

type Connection = {
  id: string;
  name: string;
  platform: string;
  status: string;
  url: string;
};

export function CreateMigrationPanel({
  sources,
  destinations,
  message,
}: {
  sources: Connection[];
  destinations: Connection[];
  message: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const canCreate = sources.length > 0 && destinations.length > 0;
  const defaultName = useMemo(() => {
    if (!canCreate) return "";
    return `${sources[0]?.name ?? "WooCommerce"} to ${destinations[0]?.name ?? "Shopify"} migration`;
  }, [canCreate, destinations, sources]);

  async function submit(formData: FormData) {
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/migrations/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        sourceConnectionId: String(formData.get("sourceConnectionId") ?? ""),
        targetConnectionId: String(formData.get("targetConnectionId") ?? ""),
      }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      message?: string;
      redirectTo?: string;
    };

    if (!response.ok || !payload.ok) {
      setError(payload.message ?? "Could not create the migration.");
      if (payload.redirectTo === "/stores") {
        setTimeout(() => router.push("/stores"), 900);
      }
      return;
    }

    setSuccess("Migration created. Opening setup wizard.");
    router.push(payload.redirectTo ?? "/migrations");
  }

  if (!canCreate) {
    return (
      <div className="grid gap-4">
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
            <div>
              <p className="font-semibold">Store connections required</p>
              <p className="mt-1 text-sm text-muted">{message}</p>
            </div>
          </div>
        </div>
        <Button href="/stores" className="w-fit">
          <Store className="h-4 w-4" /> Connect Stores
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      action={(formData) => {
        startTransition(() => {
          void submit(formData);
        });
      }}
    >
      <label className="grid gap-2 text-sm">
        <span className="text-muted">Migration name</span>
        <input
          name="name"
          defaultValue={defaultName}
          className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3 text-surface"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <ConnectionSelect
          label="WooCommerce source"
          name="sourceConnectionId"
          connections={sources}
        />
        <ConnectionSelect
          label="Shopify destination"
          name="targetConnectionId"
          connections={destinations}
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-green/30 bg-green/10 p-3 text-sm text-green">
          {success}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitBranch className="h-4 w-4" />
        )}
        {isPending ? "Creating Migration" : "Create New Migration"}
      </Button>
    </form>
  );
}

function ConnectionSelect({
  label,
  name,
  connections,
}: {
  label: string;
  name: string;
  connections: Connection[];
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <select
        name={name}
        defaultValue={connections[0]?.id}
        className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3 text-surface"
      >
        {connections.map((connection) => (
          <option key={connection.id} value={connection.id}>
            {connection.name} ({connection.status})
          </option>
        ))}
      </select>
    </label>
  );
}
