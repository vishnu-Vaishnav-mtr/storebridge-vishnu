import { AuthPage } from "@/components/auth-page";

export default function ResetPasswordPage() {
  async function noop() {
    "use server";
  }

  return (
    <AuthPage
      title="Choose a new password"
      actionLabel="Save password"
      mode="password"
      formAction={noop}
      footer="Password reset links expire for your safety."
    />
  );
}
