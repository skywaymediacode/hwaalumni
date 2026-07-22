import argon2 from "argon2";

export const passwordPolicy = {
  minLength: 12,
  maxLength: 128,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1
} as const;

export function passwordPolicyIssues(password: string): readonly string[] {
  const issues: string[] = [];
  if (password.length < passwordPolicy.minLength) issues.push(`Password must be at least ${passwordPolicy.minLength} characters.`);
  if (password.length > passwordPolicy.maxLength) issues.push(`Password must be at most ${passwordPolicy.maxLength} characters.`);
  if (!/[a-z]/u.test(password)) issues.push("Password must contain a lowercase letter.");
  if (!/[A-Z]/u.test(password)) issues.push("Password must contain an uppercase letter.");
  if (!/[0-9]/u.test(password)) issues.push("Password must contain a number.");
  return issues;
}

export async function hashPassword(password: string): Promise<string> {
  const issues = passwordPolicyIssues(password);
  if (issues.length > 0) throw new Error(issues.join(" "));
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: passwordPolicy.memoryCost,
    timeCost: passwordPolicy.timeCost,
    parallelism: passwordPolicy.parallelism,
    hashLength: 32
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (password.length > passwordPolicy.maxLength) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function passwordHashNeedsUpgrade(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, {
      memoryCost: passwordPolicy.memoryCost,
      timeCost: passwordPolicy.timeCost,
      parallelism: passwordPolicy.parallelism
    });
  } catch {
    return true;
  }
}
