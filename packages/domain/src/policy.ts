export const accountStates = ["roster-only", "pending", "active", "rejected", "suspended", "deactivated", "soft-deleted"] as const;
export type AccountState = (typeof accountStates)[number];
export type Role = "member" | "super-admin";
export type Badge = "two-year" | "four-year" | "spouse";

export interface Actor {
  id: string;
  role: Role;
  state: AccountState;
  badge: Badge;
  classYear: number | null;
  assignedClassYears: readonly number[];
  isRegistrationReviewer: boolean;
  hasTwoFactor: boolean;
  totpVerifiedAt: Date | null;
}

export type Capability =
  | "community:read"
  | "profile:edit-own"
  | "channel:join"
  | "channel:manage"
  | "class-group:read"
  | "registration:review"
  | "admin:enter"
  | "roster:import"
  | "user:manage"
  | "audit:read";

export const recentTotpWindowMs = 10 * 60 * 1000;

export function hasRecentTotpVerification(actor: Actor, now = new Date()): boolean {
  if (!actor.hasTwoFactor || actor.totpVerifiedAt === null) return false;
  const age = now.getTime() - actor.totpVerifiedAt.getTime();
  return age >= 0 && age <= recentTotpWindowMs;
}

export function can(actor: Actor, capability: Capability, resourceClassYear?: number, now = new Date()): boolean {
  if (actor.state !== "active") return false;
  switch (capability) {
    case "community:read":
    case "profile:edit-own":
    case "channel:join":
      return true;
    case "channel:manage":
      return actor.role === "super-admin" && actor.hasTwoFactor;
    case "admin:enter":
    case "roster:import":
    case "user:manage":
    case "audit:read":
      return actor.role === "super-admin" && hasRecentTotpVerification(actor, now);
    case "registration:review":
      return actor.role === "super-admin" && actor.isRegistrationReviewer && hasRecentTotpVerification(actor, now);
    case "class-group:read":
      if (actor.role === "super-admin") return actor.hasTwoFactor;
      return actor.badge !== "spouse" && resourceClassYear !== undefined && actor.assignedClassYears.includes(resourceClassYear);
  }
}

export function shouldShowEdited(createdAt: Date, editedAt: Date): boolean {
  return editedAt.getTime() - createdAt.getTime() > 5 * 60 * 1000;
}
