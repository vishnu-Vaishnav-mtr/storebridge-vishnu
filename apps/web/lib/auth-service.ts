import bcrypt from "bcryptjs";
import {
  prisma,
  type PrismaClient,
  type UserRole,
} from "@storebridge/database";
import { loginSchema, registerSchema } from "./auth-validation";

type Db = PrismaClient;

export type AuthResult =
  | {
      ok: true;
      userId: string;
      organisationId: string;
      role: UserRole;
    }
  | { ok: false; message: string };

export async function validateCredentials(
  input: unknown,
  db: Db = prisma,
): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "Enter a valid email and password." };

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      passwordHash: true,
      memberships: {
        take: 1,
        select: { organisationId: true, role: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user?.passwordHash)
    return { ok: false, message: "Invalid email or password." };
  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return { ok: false, message: "Invalid email or password." };

  const membership = user.memberships[0];
  if (!membership)
    return { ok: false, message: "Your account is not linked to a workspace." };

  return {
    ok: true,
    userId: user.id,
    organisationId: membership.organisationId,
    role: membership.role,
  };
}

export async function registerOwner(
  input: unknown,
  db: Db = prisma,
): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check your details.",
    };

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing)
    return { ok: false, message: "An account with this email already exists." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const slugBase = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 8);

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      emailVerified: new Date(),
      memberships: {
        create: {
          role: "OWNER",
          organisation: {
            create: {
              name: `${parsed.data.name}'s Workspace`,
              slug: `${slugBase || "workspace"}-${suffix}`,
            },
          },
        },
      },
    },
    select: {
      id: true,
      memberships: {
        take: 1,
        select: { organisationId: true, role: true },
      },
    },
  });

  const membership = user.memberships[0];
  if (!membership) return { ok: false, message: "Workspace creation failed." };
  return {
    ok: true,
    userId: user.id,
    organisationId: membership.organisationId,
    role: membership.role,
  };
}
