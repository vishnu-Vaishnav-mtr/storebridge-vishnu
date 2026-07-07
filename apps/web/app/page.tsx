import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  PauseCircle,
  Repeat2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const capabilities = [
  "Connection testing for WooCommerce, WordPress and Shopify",
  "Dry-run validation before anything is created",
  "Pause, resume and retry failed records independently",
  "Duplicate prevention using stable source mappings",
  "Verification and reconciliation before completion",
  "Downloadable audit, error, redirect and cutover reports",
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ink text-surface">
      <section className="blue-black-gradient relative overflow-hidden px-4 pb-10 pt-6 md:px-8">
        <nav className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="green-gradient flex h-10 w-10 items-center justify-center rounded-xl text-ink">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">StoreBridge</span>
          </div>
          <div className="flex items-center gap-3">
            <Button href="/dashboard" variant="ghost">
              View Demo
            </Button>
            <Button href="/new-migration">Start a Migration</Button>
          </div>
        </nav>

        <div className="mx-auto grid min-h-[78vh] max-w-7xl items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-green/25 bg-green/10 px-3 py-1 text-sm font-semibold text-green">
              Production migration controls for real stores
            </p>
            <h1 className="max-w-4xl text-5xl font-semibold leading-tight md:text-7xl">
              StoreBridge
            </h1>
            <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-200">
              Migrate WooCommerce to Shopify without losing track of your data.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
              Connect both stores, scan every record, review mappings, run a dry
              migration, then move products, customers, orders, media, content,
              SEO data and redirects with checkpoints and reconciliation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/new-migration">
                Start a Migration <ArrowRight className="h-4 w-4" />
              </Button>
              <Button href="/dashboard" variant="secondary">
                View Demo
              </Button>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-muted">Source</p>
                <p className="mt-2 text-xl font-semibold">WooCommerce</p>
                <p className="mt-3 text-sm text-muted">
                  Products, orders, customers, media, pages, posts and metadata
                </p>
              </div>
              <div className="green-gradient flex h-12 w-12 items-center justify-center rounded-full text-ink">
                <ArrowRight className="h-5 w-5" />
              </div>
              <div className="rounded-2xl border border-green/30 bg-green/10 p-4">
                <p className="text-sm text-green">Destination</p>
                <p className="mt-2 text-xl font-semibold">Shopify</p>
                <p className="mt-3 text-sm text-muted">
                  Products, collections, customers, orders, content, redirects
                  and files
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["Audit", "Read-only source scan"],
                ["Dry run", "Validate before import"],
                ["Verify", "Reconcile every module"],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/10 bg-ink-3 p-4"
                >
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-12 md:grid-cols-3 md:px-8">
        <Feature
          icon={PauseCircle}
          title="Pause and resume"
          body="Every migration is queued, checkpointed and resumable from the last completed item."
        />
        <Feature
          icon={Repeat2}
          title="Duplicate prevention"
          body="Source IDs, destination IDs and hashes stop reruns from creating silent duplicates."
        />
        <Feature
          icon={FileCheck2}
          title="Verification and reports"
          body="A migration is not marked verified until reconciliation passes or warnings are shown."
        />
      </section>

      <section
        id="workflow"
        className="border-y border-white/10 bg-ink-2 px-4 py-12 md:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="text-3xl font-semibold">Simple migration workflow</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-4">
            {[
              "Connect stores",
              "Scan source",
              "Map data",
              "Dry run",
              "Migrate",
              "Verify",
              "Download reports",
              "Final delta",
            ].map((step, index) => (
              <div
                key={step}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="text-sm text-green">Step {index + 1}</p>
                <p className="mt-2 font-semibold">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-[0.9fr_1.1fr] md:px-8">
        <div>
          <LockKeyhole className="h-10 w-10 text-green" />
          <h2 className="mt-4 text-3xl font-semibold">
            Credentials stay protected
          </h2>
          <p className="mt-3 text-muted">
            Store credentials are encrypted server-side with authenticated
            encryption, masked in the UI and redacted from errors and logs.
          </p>
        </div>
        <div className="grid gap-3">
          {capabilities.map((capability) => (
            <div
              key={capability}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <CheckCircle2 className="h-5 w-5 text-green" />
              <span className="text-sm">{capability}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-8 text-sm text-muted md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p>
            StoreBridge is built for careful WooCommerce to Shopify migrations.
          </p>
          <div className="flex gap-4">
            <a href="/dashboard">Dashboard</a>
            <a href="/stores">Stores</a>
            <a href="/reports">Reports</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof PauseCircle;
  title: string;
  body: string;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <Icon className="h-8 w-8 text-green" />
      <h2 className="mt-4 text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}
