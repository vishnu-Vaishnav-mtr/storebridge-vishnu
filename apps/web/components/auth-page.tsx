import { ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";

export function AuthPage({
  title,
  action,
  footer,
}: {
  title: string;
  action: string;
  footer: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4">
      <form className="glass w-full max-w-md rounded-2xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="green-gradient flex h-10 w-10 items-center justify-center rounded-xl text-ink">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold">StoreBridge</p>
            <p className="text-sm text-muted">{title}</p>
          </div>
        </div>
        <label className="grid gap-2 text-sm">
          <span className="text-muted">Email</span>
          <input
            className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3"
            type="email"
            defaultValue="demo@storebridge.local"
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm">
          <span className="text-muted">Password</span>
          <input
            className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3"
            type="password"
          />
        </label>
        <Button className="mt-6 w-full" href="/dashboard">
          {action}
        </Button>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </form>
    </main>
  );
}
