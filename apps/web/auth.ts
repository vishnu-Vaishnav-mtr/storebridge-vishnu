import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@storebridge/database";
import { validateCredentials } from "./lib/auth-service";
import { loginSchema } from "./lib/auth-validation";

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) throw new InvalidCredentials();
        const result = await validateCredentials(parsed.data);
        if (!result.ok) throw new InvalidCredentials();

        const user = await prisma.user.findUnique({
          where: { id: result.userId },
          select: { id: true, email: true, name: true },
        });
        if (!user) throw new InvalidCredentials();

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organisationId: result.organisationId,
          role: result.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.organisationId = (
          user as typeof user & { organisationId?: string }
        ).organisationId;
        token.role = (user as typeof user & { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? "");
        session.user.organisationId = String(token.organisationId ?? "");
        session.user.role = String(token.role ?? "");
      }
      return session;
    },
  },
});
