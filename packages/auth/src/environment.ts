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
  EMAIL_DELIVERY_MODE: z.enum(["log", "provider"])
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
