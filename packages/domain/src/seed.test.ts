import { describe, expect, it } from "vitest";
import { alumniSeeds, classYears, launchChannels, spouseSeeds } from "./seed";

describe("synthetic launch seeds", () => {
  it("covers every class year exactly once", () => expect(alumniSeeds.map((x) => x.year)).toEqual(classYears));
  it("uses non-deliverable test addresses", () => expect([...alumniSeeds, ...spouseSeeds].every((x) => x.email.endsWith("@example.test"))).toBe(true));
  it("creates all eleven required channels", () => expect(launchChannels).toHaveLength(11));
  it("never assigns a spouse a class year", () => expect(spouseSeeds.every((x) => x.year === null)).toBe(true));
});
