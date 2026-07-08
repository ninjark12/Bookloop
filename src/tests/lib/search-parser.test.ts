import { describe, it, expect } from "vitest";
import { parseQuery } from "@/lib/search/parser";

describe("parseQuery", () => {
  it("parses a pure tag query", () => {
    const result = parseQuery("theme:betrayal type:quote");
    expect(result.includeTags).toEqual(["theme:betrayal", "type:quote"]);
    expect(result.excludeTags).toEqual([]);
    expect(result.naturalLanguage).toBe("");
  });

  it("parses exclusion tags", () => {
    const result = parseQuery("theme:betrayal -type:summary");
    expect(result.includeTags).toEqual(["theme:betrayal"]);
    expect(result.excludeTags).toEqual(["type:summary"]);
    expect(result.naturalLanguage).toBe("");
  });

  it("treats pure natural language as naturalLanguage", () => {
    const result = parseQuery("sad chapters about betrayal");
    expect(result.includeTags).toEqual([]);
    expect(result.excludeTags).toEqual([]);
    expect(result.naturalLanguage).toBe("sad chapters about betrayal");
  });

  it("splits a mixed query into tags and natural language", () => {
    const result = parseQuery("type:quote quotes that connect to socialism");
    expect(result.includeTags).toEqual(["type:quote"]);
    expect(result.excludeTags).toEqual([]);
    expect(result.naturalLanguage).toBe("quotes that connect to socialism");
  });

  it("keeps quoted phrases together as natural language", () => {
    const result = parseQuery('"found family" emotion:joy');
    expect(result.includeTags).toEqual(["emotion:joy"]);
    expect(result.naturalLanguage).toBe("found family");
  });

  it("treats an invalid namespace as natural language", () => {
    const result = parseQuery("foo:bar hello");
    expect(result.includeTags).toEqual([]);
    expect(result.excludeTags).toEqual([]);
    expect(result.naturalLanguage).toBe("foo:bar hello");
  });

  it("returns empty structure for an empty string", () => {
    const result = parseQuery("");
    expect(result.includeTags).toEqual([]);
    expect(result.excludeTags).toEqual([]);
    expect(result.naturalLanguage).toBe("");
  });

  it("normalizes case on tags", () => {
    const result = parseQuery("THEME:Betrayal");
    expect(result.includeTags).toEqual(["theme:betrayal"]);
  });

  it("deduplicates repeated tags", () => {
    const result = parseQuery("type:quote type:quote");
    expect(result.includeTags).toEqual(["type:quote"]);
  });

  it("supports open-namespace values (character, concept)", () => {
    const result = parseQuery("character:guts concept:opportunity-cost");
    expect(result.includeTags).toEqual([
      "character:guts",
      "concept:opportunity-cost",
    ]);
  });
});
