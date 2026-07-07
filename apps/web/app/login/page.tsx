import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { auth } from "@/auth";
import { AuthPage } from "@/components/auth-page";
import { safeCallbackUrl } from "@/lib/auth-validation";

const errorMessages: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  invalid_credentials: "Invalid email or password.",
  invalid_input: "Enter a valid email and password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
    registered?: string;
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const session = await auth();
  if (session) redirect(callbackUrl);

  const error =
    params.registered === "1"
      ? "Account created. Log in to continue."
      : params.error
        ? (errorMessages[params.error] ?? "Could not log in. Try again.")
        : null;

  return (
    <AuthPage
      title="Welcome back"
      actionLabel="Log in"
      mode="login"
      formAction={loginAction}
      callbackUrl={callbackUrl}
      error={error}
      footer={
        <>
          Need an account?{" "}
          <Link
            className="font-semibold text-green"
            href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          >
            Register
          </Link>
        </>
      }
    />
  );
}
