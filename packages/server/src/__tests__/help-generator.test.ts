import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getToolHelp } from "../core/help-generator.js";

describe("help-generator", () => {
  const toolNames = ["project", "design", "build", "docs", "meta"];

  for (const name of toolNames) {
    it(`should generate help for ${name}`, () => {
      const result = getToolHelp(name);
      const text = result.content[0].text;
      assert.ok(text.includes(`# ${name}`), `Should have tool name header`);
      assert.ok(text.includes("Example:"), `Should include examples`);
    });
  }

  it("should include all project actions", () => {
    const text = getToolHelp("project").content[0].text;
    const expected = ["hello", "get", "set", "suggest", "decide", "goal", "health", "scope"];
    for (const action of expected) {
      assert.ok(text.includes(`## ${action}`), `Should include ${action} action`);
    }
  });

  it("should include required/optional params for build scaffold", () => {
    const text = getToolHelp("build").content[0].text;
    assert.ok(text.includes("**Required:** engine, name"));
  });

  it("should include examples with tool call syntax", () => {
    const text = getToolHelp("docs").content[0].text;
    assert.ok(text.includes('docs(action: "search"'));
  });

  it("should return error for unknown tool", () => {
    const result = getToolHelp("nonexistent");
    assert.ok(result.content[0].text.includes("No help available"));
  });
});
