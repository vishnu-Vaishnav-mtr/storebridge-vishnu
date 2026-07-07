import { AuthPage } from "@/components/auth-page";

export default function ForgotPasswordPage() {
  return (
    <AuthPage
      title="Reset your password"
      action="Send reset link"
      footer="Remembered your password? Log in"
    />
  );
}
