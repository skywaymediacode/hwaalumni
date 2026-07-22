import { redirect } from "next/navigation";
import { VerifySecondFactorForm } from "../../_components/auth-forms";
import { PublicFrame } from "../../_components/public-frame";
import { readSession } from "../../../lib/server/request";

export default async function VerifySecondFactorPage() {
  const session = await readSession();
  if (!session || session.role !== "super-admin" || session.state !== "active") redirect("/login");
  if (session.assurance === "mfa") redirect("/admin/registrations");
  if (!session.hasVerifiedTotp) redirect("/admin/setup-2fa");
  return <PublicFrame eyebrow="ADMINISTRATOR SECURITY" title="Verify it’s you." description="Enter the current code from your authenticator app, or use one of your one-time recovery codes." footer={<a href="/login">Cancel and sign in again</a>}>
    <VerifySecondFactorForm />
  </PublicFrame>;
}
