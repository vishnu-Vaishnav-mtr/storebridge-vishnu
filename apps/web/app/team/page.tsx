import { ShieldCheck, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentMembership } from "@/lib/session";

const roles = [
  ["OWNER", "Can manage billing, credentials and users."],
  ["ADMIN", "Can manage stores and migrations."],
  ["OPERATOR", "Can start, pause, resume and retry migrations."],
  ["VIEWER", "Can view status and reports only."],
];

export default async function TeamPage() {
  await requireCurrentMembership();

  return (
    <AppShell
      title="Team"
      subtitle="Invite operators and viewers while keeping credential access controlled."
    >
      <Card>
        <CardHeader
          title="Workspace roles"
          action={
            <Button>
              <UserPlus className="h-4 w-4" /> Invite member
            </Button>
          }
        />
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map(([role, description]) => (
            <div
              key={role}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4 text-green" /> {role}
              </div>
              <p className="mt-2 text-sm text-muted">{description}</p>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
