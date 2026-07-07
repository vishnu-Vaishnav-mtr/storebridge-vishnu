"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  PlugZap,
  Save,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type TestResult = {
  ok: boolean;
  status: string;
  storeName?: string;
  metadata: Record<string, unknown>;
  warnings: string[];
  missingPermissions: string[];
  responseTimeMs: number;
  error?: string;
};

export function WooConnectionForm() {
  const [result, setResult] = useState<TestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submit(formData: FormData, persist: boolean) {
    setIsLoading(true);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/connections/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "woocommerce",
        persist,
        ...payload,
        verifySsl: payload.verifySsl === "on",
      }),
    });
    setResult((await response.json()) as TestResult);
    setIsLoading(false);
  }

  return (
    <form
      className="grid gap-4"
      action={(formData) => {
        void submit(formData, false);
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field
          name="name"
          label="Connection name"
          placeholder="Main WooCommerce store"
        />
        <Field
          name="storeUrl"
          label="WooCommerce store URL"
          placeholder="https://example.com"
        />
        <Field
          name="consumerKey"
          label="Consumer Key"
          placeholder="ck_••••••••83F2"
        />
        <Field
          name="consumerSecret"
          label="Consumer Secret"
          type="password"
          placeholder="cs_••••••••91AB"
        />
        <Field name="apiVersion" label="API version" defaultValue="wc/v3" />
        <Field
          name="requestTimeoutMs"
          label="Request timeout"
          type="number"
          defaultValue="30000"
        />
        <Field name="wordpressUsername" label="Optional WordPress username" />
        <Field
          name="wordpressApplicationPassword"
          label="Optional WordPress Application Password"
          type="password"
        />
        <Field
          name="wordpressBaseUrl"
          label="Optional custom REST API base URL"
          placeholder="/wp-json/wp/v2"
        />
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
          <input
            name="verifySsl"
            type="checkbox"
            defaultChecked
            className="h-4 w-4 accent-green"
          />
          Verify SSL certificate
        </label>
      </div>
      <Actions
        isLoading={isLoading}
        onSave={(form) => void submit(new FormData(form), true)}
      />
      <HowTo
        title="How to create WooCommerce API keys"
        steps={[
          "Open WooCommerce settings.",
          "Go to Advanced → REST API.",
          "Create a key with read access for the source store.",
          "Paste the Consumer Key and Consumer Secret here.",
        ]}
      />
      <ConnectionResult result={result} />
    </form>
  );
}

export function ShopifyConnectionForm() {
  const [result, setResult] = useState<TestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function submit(formData: FormData, persist: boolean) {
    setIsLoading(true);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/connections/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "shopify", persist, ...payload }),
    });
    setResult((await response.json()) as TestResult);
    setIsLoading(false);
  }

  return (
    <form
      className="grid gap-4"
      action={(formData) => {
        void submit(formData, false);
      }}
    >
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="font-semibold">Method A: Shopify OAuth</p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <Field
            name="oauthShopDomain"
            label="Shop domain"
            placeholder="your-store.myshopify.com"
          />
          <Button type="button" variant="secondary" className="self-end">
            <ExternalLink className="h-4 w-4" /> Connect Shopify
          </Button>
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="font-semibold">Method B: Custom app token</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field
            name="name"
            label="Connection name"
            placeholder="Production Shopify store"
          />
          <Field
            name="shopDomain"
            label="Shopify store domain"
            placeholder="your-store.myshopify.com"
          />
          <Field
            name="adminAccessToken"
            label="Admin API access token"
            type="password"
            placeholder="shpat_••••••••91AB"
          />
          <Field name="apiVersion" label="API version" defaultValue="2026-01" />
        </div>
      </div>
      <Actions
        isLoading={isLoading}
        onSave={(form) => void submit(new FormData(form), true)}
      />
      <HowTo
        title="How to create a Shopify custom app token"
        steps={[
          "Open Shopify admin settings.",
          "Go to Apps and sales channels → Develop apps.",
          "Create a custom app and grant required Admin API scopes.",
          "Install the app and paste the Admin API access token here.",
        ]}
      />
      <ConnectionResult result={result} />
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3 text-surface placeholder:text-muted"
      />
    </label>
  );
}

function Actions({
  isLoading,
  onSave,
}: {
  isLoading: boolean;
  onSave: (form: HTMLFormElement) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" variant="secondary" disabled={isLoading}>
        <PlugZap className="h-4 w-4" />{" "}
        {isLoading ? "Testing" : "Test Connection"}
      </Button>
      <Button
        type="button"
        disabled={isLoading}
        onClick={(event) => {
          const form = event.currentTarget.form;
          if (form) onSave(form);
        }}
      >
        <Save className="h-4 w-4" /> Save Connection
      </Button>
      <Button type="button" variant="ghost">
        Disconnect
      </Button>
      <Button type="button" variant="ghost">
        <KeyRound className="h-4 w-4" /> Edit Credentials
      </Button>
      <Button type="submit" variant="ghost">
        Recheck Permissions
      </Button>
    </div>
  );
}

function HowTo({ title, steps }: { title: string; steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="text-sm font-semibold text-green"
        onClick={() => setOpen((value) => !value)}
      >
        {title}
      </button>
      {open ? (
        <ol className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-muted">
          {steps.map((step, index) => (
            <li key={step}>
              {index + 1}. {step}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function ConnectionResult({ result }: { result: TestResult | null }) {
  if (!result) return null;
  return (
    <div
      className={`rounded-xl border p-4 ${result.ok ? "border-green/30 bg-green/10" : "border-danger/30 bg-danger/10"}`}
    >
      <div className="flex items-center gap-2 font-semibold">
        {result.ok ? (
          <CheckCircle2 className="h-5 w-5 text-green" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-red-100" />
        )}
        {result.ok ? "Connected" : "Connection failed"}
      </div>
      <p className="mt-2 text-sm text-muted">
        {result.storeName ?? result.error ?? "Connection test finished."}
      </p>
      {result.missingPermissions.length ? (
        <p className="mt-2 text-sm text-warning">
          Missing scopes: {result.missingPermissions.join(", ")}
        </p>
      ) : null}
      <details className="mt-3 text-sm text-muted">
        <summary>Developer details</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-ink p-3 text-xs">
          {JSON.stringify(result.metadata, null, 2)}
        </pre>
      </details>
    </div>
  );
}
