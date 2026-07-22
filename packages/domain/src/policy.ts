export const accountStates = ["roster-only", "pending", "active", "suspended", "deactivated", "soft-deleted"] as const;
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
}

export type Capability =
  | "community:read"
  | "profile:edit-own"
  | "channel:join"
  | "channel:manage"
  | "class-group:read"
  | "registration:review"
  | "admin:enter";

export function can(actor: Actor, capability: Capability, resourceClassYear?: number): boolean {
  if (actor.state !== "active") return false;
  switch (capability) {
    case "community:read":
    case "profile:edit-own":
    case "channel:join":
      return true;
    case "channel:manage":
      return actor.role === "super-admin" && actor.hasTwoFactor;
    case "admin:enter":
      return actor.role === "super-admin" && actor.hasTwoFactor;
    case "registration:review":
      return actor.role === "super-admin" && actor.hasTwoFactor && actor.isRegistrationReviewer;
    case "class-group:read":
      if (actor.role === "super-admin") return actor.hasTwoFactor;
      return actor.badge !== "spouse" && resourceClassYear !== undefined && actor.assignedClassYears.includes(resourceClassYear);
  }
}

export function shouldShowEdited(createdAt: Date, editedAt: Date): boolean {
  return editedAt.getTime() - createdAt.getTime() > 5 * 60 * 1000;
}
