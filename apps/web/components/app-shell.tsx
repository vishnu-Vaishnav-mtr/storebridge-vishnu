import {
  Activity,
  BarChart3,
  CircleHelp,
  FileText,
  Gauge,
  GitBranch,
  Home,
  Layers3,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: Gauge },
  { label: "Stores", href: "/stores", icon: Store },
  { label: "New Migration", href: "/new-migration", icon: GitBranch },
  { label: "Migrations", href: "/migrations", icon: Layers3 },
  { label: "Mappings", href: "/new-migration#mapping", icon: BarChart3 },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Team", href: "/team", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Help", href: "/#workflow", icon: CircleHelp },
];

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen bg-ink text-surface">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-ink-2/95 p-4 lg:block">
        <Link
          href="/"
          className="mb-8 flex items-center gap-3 rounded-2xl px-2 py-3"
        >
          <div className="green-gradient flex h-10 w-10 items-center justify-center rounded-xl text-ink">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold">StoreBridge</p>
            <p className="text-xs text-muted">Woo to Shopify</p>
          </div>
        </Link>
        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-white/8 hover:text-surface"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-ink/86 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Home className="h-3.5 w-3.5" />
                StoreBridge / {title}
              </div>
              <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-muted">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <label className="hidden min-w-72 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted md:flex">
                <Search className="h-4 w-4" />
                <input
                  className="w-full bg-transparent outline-none placeholder:text-muted"
                  placeholder="Search migrations, stores, reports"
                />
              </label>
              <Button href="/new-migration">Create New Migration</Button>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
