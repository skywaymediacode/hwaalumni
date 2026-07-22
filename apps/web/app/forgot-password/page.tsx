import { ForgotPasswordForm } from "../_components/auth-forms";
import { PublicFrame } from "../_components/public-frame";

export default function ForgotPasswordPage() {
  return <PublicFrame eyebrow="ACCOUNT RECOVERY" title="Reset your password." description="Enter your account email. For privacy, the response is the same whether or not an eligible account is found." footer={<a href="/login">Return to sign in</a>}>
    <ForgotPasswordForm />
  </PublicFrame>;
}
