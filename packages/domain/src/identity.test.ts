import { describe, expect, it } from "vitest";
import { genericRegistrationResponse, normalizeEmail, normalizeFullName, safeInternalRedirect } from "./identity";

describe("roster identity normalization", () => {
  it("normalizes Unicode, case, and repeated whitespace", () => {
    expect(normalizeFullName("  MIA\t Hart  ")).toBe("mia hart");
    expect(normalizeEmail(" Mia.HART@Example.Test ")).toBe("mia.hart@example.test");
  });

  it("provides one generic public response", () => {
    expect(genericRegistrationResponse).not.toMatch(/found|missing|exists|roster match/i);
  });
});

describe("safe redirects", () => {
  it("accepts internal paths and rejects external or ambiguous paths", () => {
    expect(safeInternalRedirect("/directory?year=2012")).toBe("/directory?year=2012");
    expect(safeInternalRedirect("https://evil.example")).toBe("/home");
    expect(safeInternalRedirect("//evil.example")).toBe("/home");
    expect(safeInternalRedirect("/\\evil.example")).toBe("/home");
  });
});
