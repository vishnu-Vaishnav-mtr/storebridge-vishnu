"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { registerOwner } from "@/lib/auth-service";
import {
  loginSchema,
  registerSchema,
  safeCallbackUrl,
} from "@/lib/auth-validation";
import { rateLimit } from "@/lib/rate-limit";

export async function loginAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl")?.toString(),
  });

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl")?.toString());
  if (!parsed.success)
    redirect(
      `/login?error=invalid_input&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  const limited = rateLimit({
    key: `login:${parsed.data.email.toLowerCase()}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    redirect(
      `/login?error=Too%20many%20login%20attempts.&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(
        `/login?error=invalid_credentials&callbackUrl=${encodeURIComponent(callbackUrl)}`,
      );
    }
    throw error;
  }
}

export async function registerAction(formData: FormData) {
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl")?.toString());
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl,
  });

  if (!parsed.success) {
    redirect(
      `/register?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check your details.")}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }
  const limited = rateLimit({
    key: `register:${parsed.data.email.toLowerCase()}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    redirect(
      `/register?error=Too%20many%20registration%20attempts.&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }

  const result = await registerOwner(parsed.data);
  if (!result.ok) {
    redirect(
      `/register?error=${encodeURIComponent(result.message)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError)
      redirect(
        `/login?registered=1&callbackUrl=${encodeURIComponent(callbackUrl)}`,
      );
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
