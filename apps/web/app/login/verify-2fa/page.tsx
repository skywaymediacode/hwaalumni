import { redirect } from "next/navigation";
import { VerifySecondFactorForm } from "../../_components/auth-forms";
import { PublicFrame } from "../../_components/public-frame";
import { readSession } from "../../../lib/server/request";
import { can } from "@hwa/domain";
import { toActor } from "../../../lib/server/request";

export default async function VerifySecondFactorPage() {
  const session = await readSession();
  if (!session || session.role !== "super-admin" || session.state !== "active") redirect("/login");
  if (!session.hasVerifiedTotp) redirect("/admin/setup-2fa");
  const actor = toActor(session);
  if (session.assurance === "mfa" && actor && can(actor, "admin:enter")) redirect("/admin/registrations");
  return <PublicFrame eyebrow="ADMINISTRATOR SECURITY" title="Verify it’s you." description="Enter the current code from your authenticator app, or use one of your one-time recovery codes." footer={<a href="/login">Cancel and sign in again</a>}>
    <VerifySecondFactorForm />
  </PublicFrame>;
}
