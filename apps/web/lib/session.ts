import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma, type UserRole } from "@storebridge/database";

export interface CurrentMembership {
  userId: string;
  email: string;
  name: string | null;
  organisationId: string;
  role: UserRole;
}

export async function getCurrentMembership(): Promise<CurrentMembership | null> {
  const session = await auth();
  const userId = session?.user?.id;
  const organisationId = session?.user?.organisationId;
  if (!userId || !organisationId) return null;

  const membership = await prisma.organisationMember.findUnique({
    where: { organisationId_userId: { organisationId, userId } },
    include: {
      user: { select: { email: true, name: true } },
    },
  });
  if (!membership) return null;

  return {
    userId,
    organisationId,
    role: membership.role,
    email: membership.user.email,
    name: membership.user.name,
  };
}

export async function requireCurrentMembership() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login");
  return membership;
}

export function canManageReports(role: UserRole) {
  return ["OWNER", "ADMIN", "OPERATOR", "VIEWER"].includes(role);
}
