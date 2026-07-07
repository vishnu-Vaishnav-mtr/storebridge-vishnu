import Link from "next/link";
import { AuthPage } from "@/components/auth-page";

export default function ForgotPasswordPage() {
  async function noop() {
    "use server";
  }

  return (
    <AuthPage
      title="Reset your password"
      actionLabel="Send reset link"
      mode="password"
      formAction={noop}
      footer={
        <>
          Remembered your password?{" "}
          <Link className="font-semibold text-green" href="/login">
            Log in
          </Link>
        </>
      }
    />
  );
}
