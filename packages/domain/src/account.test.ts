import { describe, expect, it } from "vitest";
import { assertAccountStateTransition, canTransitionAccountState, classProfileIssues, isValidClassYear } from "./account";

describe("account-state transitions", () => {
  it("allows the registration and approval lifecycle", () => {
    expect(canTransitionAccountState("roster-only", "pending")).toBe(true);
    expect(canTransitionAccountState("pending", "active")).toBe(true);
    expect(canTransitionAccountState("pending", "rejected")).toBe(true);
  });

  it("keeps soft deletion terminal", () => {
    expect(canTransitionAccountState("soft-deleted", "active")).toBe(false);
    expect(() => assertAccountStateTransition("soft-deleted", "active")).toThrow("Invalid account-state transition");
  });
});

describe("class profiles", () => {
  it("accepts graduate years at both launch boundaries", () => {
    expect(isValidClassYear(2001)).toBe(true);
    expect(isValidClassYear(2026)).toBe(true);
    expect(isValidClassYear(2000)).toBe(false);
    expect(isValidClassYear(2027)).toBe(false);
  });

  it("requires a graduate class assignment", () => {
    expect(classProfileIssues({ badge: "four-year", graduationYear: 2012, assignedClassYears: [] })).toContain(
      "A graduate must be assigned to their graduation-year class group."
    );
  });

  it("prevents spouse class-group membership", () => {
    expect(classProfileIssues({ badge: "spouse", graduationYear: 2012, assignedClassYears: [2012] })).toEqual([
      "Spouses cannot have a graduation year.",
      "Spouses cannot have class-group assignments."
    ]);
  });
});
