import Link from "next/link";
import { redirect } from "next/navigation";
import { registerAction } from "@/app/actions/auth";
import { auth } from "@/auth";
import { AuthPage } from "@/components/auth-page";
import { safeCallbackUrl } from "@/lib/auth-validation";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const session = await auth();
  if (session) redirect(callbackUrl);

  return (
    <AuthPage
      title="Create your account"
      actionLabel="Create account"
      mode="register"
      formAction={registerAction}
      callbackUrl={callbackUrl}
      error={params.error ? decodeURIComponent(params.error) : null}
      footer={
        <>
          Already registered?{" "}
          <Link
            className="font-semibold text-green"
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          >
            Log in
          </Link>
        </>
      }
    />
  );
}
