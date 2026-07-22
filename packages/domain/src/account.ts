import type { AccountState, Badge } from "./policy";

export const minimumClassYear = 2001;
export const maximumClassYear = 2026;

const transitions: Readonly<Record<AccountState, readonly AccountState[]>> = {
  "roster-only": ["pending", "soft-deleted"],
  pending: ["active", "rejected", "soft-deleted"],
  active: ["suspended", "deactivated", "soft-deleted"],
  rejected: ["pending", "soft-deleted"],
  suspended: ["active", "deactivated", "soft-deleted"],
  deactivated: ["active", "soft-deleted"],
  "soft-deleted": []
};

export function canTransitionAccountState(from: AccountState, to: AccountState): boolean {
  return transitions[from].includes(to);
}

export function assertAccountStateTransition(from: AccountState, to: AccountState): void {
  if (!canTransitionAccountState(from, to)) {
    throw new Error(`Invalid account-state transition: ${from} -> ${to}`);
  }
}

export function isValidClassYear(year: number): boolean {
  return Number.isInteger(year) && year >= minimumClassYear && year <= maximumClassYear;
}

export interface ClassProfile {
  badge: Badge;
  graduationYear: number | null;
  assignedClassYears: readonly number[];
}

export function classProfileIssues(profile: ClassProfile): readonly string[] {
  const issues: string[] = [];
  const uniqueAssignments = new Set(profile.assignedClassYears);

  if (uniqueAssignments.size !== profile.assignedClassYears.length) {
    issues.push("Class assignments must be unique.");
  }
  if (profile.assignedClassYears.some((year) => !isValidClassYear(year))) {
    issues.push(`Class assignments must be between ${minimumClassYear} and ${maximumClassYear}.`);
  }

  if (profile.badge === "spouse") {
    if (profile.graduationYear !== null) issues.push("Spouses cannot have a graduation year.");
    if (profile.assignedClassYears.length > 0) issues.push("Spouses cannot have class-group assignments.");
    return issues;
  }

  if (profile.graduationYear === null || !isValidClassYear(profile.graduationYear)) {
    issues.push(`Graduates must have a graduation year between ${minimumClassYear} and ${maximumClassYear}.`);
  } else if (!uniqueAssignments.has(profile.graduationYear)) {
    issues.push("A graduate must be assigned to their graduation-year class group.");
  }

  return issues;
}

export function assertValidClassProfile(profile: ClassProfile): void {
  const issues = classProfileIssues(profile);
  if (issues.length > 0) throw new Error(issues.join(" "));
}
