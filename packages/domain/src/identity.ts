export const genericRegistrationResponse =
  "If the information matches our alumni records, we will send further instructions after review.";

export function normalizeFullName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function safeInternalRedirect(value: string | null | undefined, fallback = "/home"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/\p{Cc}/u.test(value)) return fallback;
  return value;
}
