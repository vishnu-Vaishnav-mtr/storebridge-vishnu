import { ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";

export function AuthPage({
  title,
  actionLabel,
  footer,
  mode,
  formAction,
  callbackUrl,
  error,
}: {
  title: string;
  actionLabel: string;
  footer: React.ReactNode;
  mode: "login" | "register" | "password";
  formAction: (formData: FormData) => void | Promise<void>;
  callbackUrl?: string;
  error?: string | null;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4">
      <form
        action={formAction}
        className="glass w-full max-w-md rounded-2xl p-6"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="green-gradient flex h-10 w-10 items-center justify-center rounded-xl text-ink">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold">StoreBridge</p>
            <p className="text-sm text-muted">{title}</p>
          </div>
        </div>
        {error ? (
          <div
            className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-100"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        {mode === "register" ? (
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Name</span>
            <input
              className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3"
              name="name"
              type="text"
              autoComplete="name"
              required
            />
          </label>
        ) : null}
        <label className="grid gap-2 text-sm">
          <span className="text-muted">Email</span>
          <input
            className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm">
          <span className="text-muted">Password</span>
          <input
            className="focus-ring min-h-11 rounded-xl border border-white/10 bg-ink px-3"
            name="password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            required
          />
        </label>
        <input
          type="hidden"
          name="callbackUrl"
          value={callbackUrl ?? "/dashboard"}
        />
        <Button className="mt-6 w-full" type="submit">
          {actionLabel}
        </Button>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </form>
    </main>
  );
}
