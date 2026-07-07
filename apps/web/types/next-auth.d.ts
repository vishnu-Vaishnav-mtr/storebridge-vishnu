import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      organisationId: string;
      role: string;
    };
  }

  interface User {
    organisationId?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    organisationId?: string;
    role?: string;
  }
}
