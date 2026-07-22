import { createTotpEnrollment, createTotpUri, decryptValue, encryptValue } from "@hwa/auth";
import { findTotpFactor, saveUnverifiedTotpFactor } from "@hwa/db";
import { redirect } from "next/navigation";
import { CompleteTotpSetupForm } from "../../_components/auth-forms";
import { PublicFrame } from "../../_components/public-frame";
import { readSession } from "../../../lib/server/request";
import { getRuntime } from "../../../lib/server/runtime";

export default async function SetupTwoFactorPage() {
  const session = await readSession();
  if (!session || session.role !== "super-admin" || session.state !== "active") redirect("/login");
  if (session.assurance === "mfa") redirect("/admin/registrations");
  const { database, totpEncryptionKey } = getRuntime();
  let factor = await findTotpFactor(database.db, session.userId);
  if (factor?.verifiedAt) redirect("/login/verify-2fa");

  let secret: string;
  if (factor) {
    secret = decryptValue({ ciphertext: factor.encryptedSecret, iv: factor.encryptionIv, tag: factor.encryptionTag }, totpEncryptionKey);
  } else {
    const enrollment = createTotpEnrollment(session.email);
    secret = enrollment.secret;
    const encrypted = encryptValue(secret, totpEncryptionKey);
    await saveUnverifiedTotpFactor(database.db, {
      userId: session.userId,
      encryptedSecret: encrypted.ciphertext,
      encryptionIv: encrypted.iv,
      encryptionTag: encrypted.tag
    });
    factor = await findTotpFactor(database.db, session.userId);
  }
  const uri = createTotpUri(secret, session.email);

  return <PublicFrame eyebrow="REQUIRED ADMINISTRATOR SECURITY" title="Protect your admin account." description="Add HWA Connect to an authenticator app before entering the administration area.">
    <section className="totp-setup"><ol><li>Open your authenticator app and choose to add an account.</li><li>Enter the setup key below, or use the app’s URI import option.</li><li>Enter the six-digit code it generates.</li></ol><div className="setup-secret"><span>SETUP KEY</span><code>{secret}</code></div><details><summary>Show authenticator URI</summary><code className="uri-code">{uri}</code></details></section>
    <CompleteTotpSetupForm />
  </PublicFrame>;
}
