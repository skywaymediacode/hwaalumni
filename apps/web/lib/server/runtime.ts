import "server-only";

import { decodeEncryptionKey, parseAuthEnvironment, type AuthEnvironment } from "@hwa/auth";
import { createDatabase, type DatabaseHandle } from "@hwa/db";

export interface WebRuntime {
  environment: AuthEnvironment;
  database: DatabaseHandle;
  totpEncryptionKey: Buffer;
  outboxEncryptionKey: Buffer;
}

let runtime: WebRuntime | undefined;

export function getRuntime(): WebRuntime {
  if (runtime) return runtime;
  const environment = parseAuthEnvironment(process.env);
  runtime = {
    environment,
    database: createDatabase(environment.DATABASE_URL),
    totpEncryptionKey: decodeEncryptionKey(environment.TOTP_ENCRYPTION_KEY),
    outboxEncryptionKey: decodeEncryptionKey(environment.OUTBOX_ENCRYPTION_KEY)
  };
  return runtime;
}
