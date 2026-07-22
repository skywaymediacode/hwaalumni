import { describe, expect, it } from "vitest";
import { previewRosterCsv } from "./roster";

const header = "full_name,email,badge,graduation_year";

describe("roster CSV preview", () => {
  it("normalizes valid graduate and spouse rows", () => {
    const result = previewRosterCsv(`${header}\nMia Hart,Mia.Hart@example.test,four-year,2012\nClaire Hart,claire.hart@example.test,spouse,`);
    expect(result.issues).toEqual([]);
    expect(result.rows).toMatchObject([
      { normalizedFullName: "mia hart", normalizedEmail: "mia.hart@example.test", graduationYear: 2012 },
      { normalizedFullName: "claire hart", graduationYear: null }
    ]);
  });

  it("reports duplicate email and invalid class data", () => {
    const result = previewRosterCsv(`${header}\nMia Hart,mia@example.test,four-year,2000\nMia H,mia@example.test,spouse,2012`);
    expect(result.rows).toEqual([]);
    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      "Graduation year must be between 2001 and 2026.",
      "Spouses cannot have a graduation year.",
      "Duplicate email; first seen on row 2."
    ]));
  });

  it("requires the exact import headers", () => {
    expect(previewRosterCsv("name,email\nMia,mia@example.test").issues[0]?.message).toContain("Required headers");
  });
});
