import { ResetPasswordForm } from "../_components/auth-forms";
import { PublicFrame } from "../_components/public-frame";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <PublicFrame eyebrow="ACCOUNT RECOVERY" title="Choose a new password." description="Changing your password signs your account out on every device." footer={<a href="/login">Return to sign in</a>}>
    {token ? <ResetPasswordForm token={token} /> : <p className="form-notice error" role="alert">This reset link is invalid or incomplete.</p>}
  </PublicFrame>;
}
