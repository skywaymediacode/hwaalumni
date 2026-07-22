import {
  ConsoleEmailAdapter,
  decodeEncryptionKey,
  decryptValue,
  parseAuthEnvironment,
  SmtpEmailAdapter,
  type EmailAdapter,
  type EmailMessage,
  type EmailTemplate
} from "@hwa/auth";
import { createDatabase } from "./connection";
import { claimEmailJobs, markEmailFailed, markEmailSent, type ClaimedEmailJob } from "./outbox";

function createAdapter(environment: ReturnType<typeof parseAuthEnvironment>): EmailAdapter {
  if (environment.EMAIL_DELIVERY_MODE === "log") return new ConsoleEmailAdapter();
  if (!environment.SMTP_HOST || !environment.SMTP_PORT) throw new Error("SMTP delivery is not configured.");
  return new SmtpEmailAdapter({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: environment.SMTP_SECURE === "true",
    from: environment.EMAIL_FROM,
    ...(environment.SMTP_USER && environment.SMTP_PASSWORD ? { user: environment.SMTP_USER, password: environment.SMTP_PASSWORD } : {})
  });
}

function template(value: string): EmailTemplate {
  const templates: EmailTemplate[] = ["registration-received", "registration-approved", "registration-rejected", "password-reset", "admin-2fa-changed", "welcome"];
  if (!templates.includes(value as EmailTemplate)) throw new Error("unsupported-template");
  return value as EmailTemplate;
}

function displayName(job: ClaimedEmailJob): string {
  const metadata = job.publicMetadata as Record<string, unknown>;
  return typeof metadata.displayName === "string" ? metadata.displayName : "HWA alumnus";
}

function resetUrl(job: ClaimedEmailJob, key: Buffer): string {
  if (!job.encryptedPayload || !job.encryptionIv || !job.encryptionTag) throw new Error("missing-encrypted-payload");
  const payload = JSON.parse(decryptValue({ ciphertext: job.encryptedPayload, iv: job.encryptionIv, tag: job.encryptionTag }, key)) as unknown;
  if (!payload || typeof payload !== "object" || !("resetUrl" in payload) || typeof payload.resetUrl !== "string") throw new Error("invalid-encrypted-payload");
  return payload.resetUrl;
}

function render(job: ClaimedEmailJob, outboxKey: Buffer): EmailMessage {
  const name = displayName(job);
  const selected = template(job.template);
  switch (selected) {
    case "registration-received": return { to: job.recipient, template: selected, subject: "HWA Connect access request received", text: `Hello ${name},\n\nYour HWA Connect access request was received and is awaiting administrator review.` };
    case "registration-approved": return { to: job.recipient, template: selected, subject: "Your HWA Connect access is approved", text: `Hello ${name},\n\nYour HWA Connect membership is approved. Sign in to enter the alumni community.` };
    case "registration-rejected": return { to: job.recipient, template: selected, subject: "HWA Connect access request update", text: `Hello ${name},\n\nWe could not approve your HWA Connect access request. Contact an administrator if you believe this is an error.` };
    case "password-reset": return { to: job.recipient, template: selected, subject: "Reset your HWA Connect password", text: `Hello ${name},\n\nUse this link within 30 minutes to reset your password:\n${resetUrl(job, outboxKey)}`, containsSensitiveLink: true };
    case "admin-2fa-changed": return { to: job.recipient, template: selected, subject: "HWA Connect administrator security changed", text: `Hello ${name},\n\nTwo-factor authentication was changed on your administrator account. Contact another administrator immediately if this was not you.` };
    case "welcome": return { to: job.recipient, template: selected, subject: "Welcome to HWA Connect", text: `Welcome to HWA Connect, ${name}.` };
  }
}

async function main(): Promise<void> {
  const environment = parseAuthEnvironment(process.env);
  const adapter = createAdapter(environment);
  const outboxKey = decodeEncryptionKey(environment.OUTBOX_ENCRYPTION_KEY);
  const handle = createDatabase(environment.DATABASE_URL);
  const limit = Number.parseInt(process.env.EMAIL_BATCH_SIZE ?? "25", 10);
  try {
    const jobs = await claimEmailJobs(handle.db, Number.isInteger(limit) ? limit : 25);
    let sent = 0;
    for (const job of jobs) {
      try {
        await adapter.send(render(job, outboxKey));
        await markEmailSent(handle.db, job.id);
        sent += 1;
      } catch {
        await markEmailFailed(handle.db, job.id, job.attempts, "delivery-failed");
      }
    }
    process.stdout.write(`Email outbox processed: ${sent} sent, ${jobs.length - sent} deferred.\n`);
  } finally {
    await handle.pool.end();
  }
}

main().catch(() => {
  process.stderr.write("Email outbox dispatch failed. No credentials, tokens, or message contents were logged.\n");
  process.exitCode = 1;
});
