import { describe, expect, it } from "vitest";
import { can, shouldShowEdited, type Actor } from "./policy";

const graduate: Actor = { id: "g", role: "member", state: "active", badge: "four-year", classYear: 2012, assignedClassYears: [2012], isRegistrationReviewer: false, hasTwoFactor: false };
const admin: Actor = { ...graduate, id: "a", role: "super-admin", hasTwoFactor: true, isRegistrationReviewer: true };

describe("authorization policy", () => {
  it("denies all community access before activation", () => expect(can({ ...graduate, state: "pending" }, "community:read")).toBe(false));
  it("keeps spouses out of class groups", () => expect(can({ ...graduate, badge: "spouse", classYear: null, assignedClassYears: [] }, "class-group:read", 2012)).toBe(false));
  it("limits graduates to explicitly assigned class groups", () => {
    expect(can(graduate, "class-group:read", 2012)).toBe(true);
    expect(can(graduate, "class-group:read", 2013)).toBe(false);
  });
  it("requires both reviewer designation and 2FA", () => {
    expect(can(admin, "registration:review")).toBe(true);
    expect(can({ ...admin, hasTwoFactor: false }, "registration:review")).toBe(false);
    expect(can({ ...admin, isRegistrationReviewer: false }, "registration:review")).toBe(false);
  });
});

describe("edit labeling", () => {
  const created = new Date("2026-01-01T00:00:00Z");
  it("does not label edits at five minutes", () => expect(shouldShowEdited(created, new Date("2026-01-01T00:05:00Z"))).toBe(false));
  it("labels edits after five minutes", () => expect(shouldShowEdited(created, new Date("2026-01-01T00:05:01Z"))).toBe(true));
});
