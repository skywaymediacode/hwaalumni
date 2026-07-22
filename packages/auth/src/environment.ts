import { z } from "zod";
import { decodeEncryptionKey } from "./encryption";

const environmentSchema = z.object({
  APP_ENV: z.enum(["local", "test", "preview", "staging", "production"]),
  NEXT_PUBLIC_APP_URL: z.url(),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  SESSION_SECRET: z.string().min(32),
  TOTP_ENCRYPTION_KEY: z.string().min(1),
  OUTBOX_ENCRYPTION_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  EMAIL_DELIVERY_MODE: z.enum(["log", "provider"]),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional()
}).superRefine((environment, context) => {
  if (environment.EMAIL_DELIVERY_MODE !== "provider") return;
  if (!environment.SMTP_HOST) context.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "SMTP_HOST is required for provider email delivery." });
  if (!environment.SMTP_PORT) context.addIssue({ code: "custom", path: ["SMTP_PORT"], message: "SMTP_PORT is required for provider email delivery." });
  if ((environment.SMTP_USER && !environment.SMTP_PASSWORD) || (!environment.SMTP_USER && environment.SMTP_PASSWORD)) {
    context.addIssue({ code: "custom", path: ["SMTP_USER"], message: "SMTP_USER and SMTP_PASSWORD must be configured together." });
  }
});

export type AuthEnvironment = z.infer<typeof environmentSchema>;

export function parseAuthEnvironment(input: Record<string, string | undefined>): AuthEnvironment {
  const environment = environmentSchema.parse(input);
  decodeEncryptionKey(environment.TOTP_ENCRYPTION_KEY);
  decodeEncryptionKey(environment.OUTBOX_ENCRYPTION_KEY);
  if (environment.APP_ENV === "production" && !environment.NEXT_PUBLIC_APP_URL.startsWith("https://")) {
    throw new Error("Production application URL must use HTTPS.");
  }
  if (environment.APP_ENV === "production" && environment.EMAIL_DELIVERY_MODE !== "provider") {
    throw new Error("Production email delivery must use a configured provider.");
  }
  return environment;
}
