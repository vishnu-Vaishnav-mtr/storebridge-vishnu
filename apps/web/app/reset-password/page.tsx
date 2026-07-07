import { AuthPage } from "@/components/auth-page";

export default function ResetPasswordPage() {
  return (
    <AuthPage
      title="Choose a new password"
      action="Save password"
      footer="Password reset links expire for your safety."
    />
  );
}
