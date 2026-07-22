import { decryptValue, recoveryDisplayCookieName, type EncryptedValue } from "@hwa/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { finishAdministratorTotpSetup } from "../../../actions";
import { PublicFrame } from "../../../_components/public-frame";
import { requireAdministrator } from "../../../../lib/server/request";
import { getRuntime } from "../../../../lib/server/runtime";

export default async function RecoveryCodesPage() {
  await requireAdministrator();
  const cookieStore = await cookies();
  const payload = cookieStore.get(recoveryDisplayCookieName)?.value;
  if (!payload) redirect("/admin/registrations");

  let codes: readonly string[];
  try {
    const encrypted = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EncryptedValue;
    const parsed = JSON.parse(decryptValue(encrypted, getRuntime().totpEncryptionKey)) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((code) => typeof code === "string")) throw new Error("Invalid recovery-code display payload.");
    codes = parsed;
  } catch {
    redirect("/admin/registrations");
  }

  return <PublicFrame eyebrow="ADMINISTRATOR SECURITY" title="Save your recovery codes." description="These one-time codes are the only backup if your authenticator is unavailable. They will not be shown again.">
    <section className="recovery-codes" aria-labelledby="recovery-title"><h2 id="recovery-title">One-time recovery codes</h2><ul>{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ul><p>Store them in a private password manager or another secure location. Each code works once.</p></section>
    <form action={finishAdministratorTotpSetup}><button className="primary submit" type="submit">I have saved these codes</button></form>
  </PublicFrame>;
}
