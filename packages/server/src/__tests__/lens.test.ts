import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { fileURLToPath } from "url";
import { LENSES, findLens, matchLenses } from "../core/lenses.js";
import { lensToolDef } from "../tools/lens.js";
import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { ToolDependencies } from "../tool-definition.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "../../docs");

// Real dependencies — the lens is also the door to the knowledge base
let deps: ToolDependencies;

before(async () => {
  const docStore = new DocStore(docsRoot);
  await docStore.load();
  const allDocs = [...docStore.getAllDocs()];
  const searchEngine = new SearchEngine();
  searchEngine.index(allDocs);
  deps = {
    docStore,
    searchEngine,
    analytics: { recordSearch() {}, recordDocAccess() {} } as unknown as ToolDependencies["analytics"],
    serverVersion: "test",
    allDocs,
  };
});

describe("lens library", () => {
  it("has unique ids and names", () => {
    const ids = LENSES.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate lens ids");
    const names = LENSES.map((l) => l.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, "duplicate lens names");
  });

  it("every lens is fully specified", () => {
    for (const lens of LENSES) {
      assert.match(lens.id, /^[a-z0-9-]+$/, `${lens.id}: id must be kebab-case`);
      assert.ok(lens.oneLiner.length >= 20, `${lens.id}: oneLiner too thin`);
      assert.ok(lens.provenance.length >= 20, `${lens.id}: provenance missing`);
      assert.ok(lens.philosophy.length >= 400, `${lens.id}: philosophy too thin to be useful`);
      assert.ok(lens.questions.length >= 5, `${lens.id}: needs at least 5 questions`);
      assert.ok(lens.redFlags.length >= 4, `${lens.id}: needs at least 4 red flags`);
      assert.ok(lens.prescriptions.length >= 4, `${lens.id}: needs at least 4 prescriptions`);
      assert.ok(lens.phases.length >= 1, `${lens.id}: needs phase tags`);
      assert.ok(lens.keywords.length >= 5, `${lens.id}: needs matching keywords`);
      assert.ok(lens.furtherReading.length >= 1, `${lens.id}: needs further reading`);
    }
  });

  it("covers the expected canon", () => {
    for (const id of [
      "find-the-fun", "mda", "interesting-decisions", "game-feel", "juice",
      "flow-difficulty", "onboarding", "kishotenketsu", "core-loop", "scope",
      "playtesting", "player-motivation", "balance", "theory-of-fun", "emergence",
    ]) {
      assert.ok(LENSES.some((l) => l.id === id), `missing canonical lens: ${id}`);
    }
  });
});

describe("matchLenses", () => {
  const expectMatch = (situation: string, expectedId: string) => {
    const ids = matchLenses(situation, 3).map((m) => m.lens.id);
    assert.ok(
      ids.includes(expectedId),
      `"${situation}" should surface ${expectedId}, got: ${ids.join(", ") || "(none)"}`
    );
  };

  it("routes feel complaints to game-feel", () => {
    expectMatch("my jump feels floaty and unresponsive", "game-feel");
  });

  it("routes impact complaints to juice", () => {
    expectMatch("combat lacks impact, hits feel flat", "juice");
  });

  it("routes feature-add deliberation to scope", () => {
    expectMatch("thinking about adding a crafting system, worried about scope creep", "scope");
  });

  it("routes difficulty complaints to flow-difficulty", () => {
    expectMatch("players quit at the first boss because it is too hard", "flow-difficulty");
  });

  it("routes tutorial problems to onboarding", () => {
    expectMatch("new players are confused by the tutorial and quit", "onboarding");
  });

  it("routes dominant-strategy problems to interesting-decisions", () => {
    expectMatch("everyone picks the same weapon, other options feel useless", "interesting-decisions");
  });

  // Regression: natural phrasing must survive word-form differences —
  // "grindy"/"grind", "cards"/"card". This exact sentence matched zero
  // lenses in 2.0.0.
  it("matches natural phrasing via word-form normalization", () => {
    const sentence =
      "my pet card battler feels grindy, players just play the strongest card every turn";
    expectMatch(sentence, "interesting-decisions");
    expectMatch(sentence, "balance");
  });

  it("normalizes plurals and adjective forms", () => {
    expectMatch("jumps feel floaty", "game-feel");
    expectMatch("the whole game is grindy", "balance");
  });

  it("returns nothing for empty input", () => {
    assert.equal(matchLenses("").length, 0);
  });

  it("caps results at the limit", () => {
    const matches = matchLenses("boring repetitive game, players quit, needs depth and balance", 3);
    assert.ok(matches.length <= 3);
  });
});

describe("findLens", () => {
  it("finds by exact id", () => {
    assert.equal(findLens("game-feel")?.id, "game-feel");
  });

  it("finds by name, case-insensitive", () => {
    assert.equal(findLens("Game Feel")?.id, "game-feel");
  });

  it("finds by unambiguous substring", () => {
    assert.equal(findLens("kishotenketsu")?.id, "kishotenketsu");
    assert.equal(findLens("juice")?.id, "juice");
  });

  it("returns null for unknown or ambiguous input", () => {
    assert.equal(findLens("quantum-blockchain"), null);
  });
});

describe("lens tool", () => {
  it("returns the catalog with no args", async () => {
    const result = await lensToolDef.handler({}, deps);
    const text = result.content[0].text;
    assert.ok(text.includes("The Designer's Lenses"));
    for (const lens of LENSES) {
      assert.ok(text.includes(lens.id), `catalog missing ${lens.id}`);
    }
    assert.ok(!result.isError);
  });

  it("renders matched lenses for a situation", async () => {
    const result = await lensToolDef.handler(
      { situation: "my jump feels floaty" }, deps
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Game Feel"), "should render the game-feel lens");
    assert.ok(text.includes("Ask yourself:"));
    assert.ok(text.includes("Red flags:"));
    assert.ok(text.includes("Do this:"));
    assert.ok(text.includes("Swink"), "provenance should be present");
  });

  it("renders a named lens", async () => {
    const result = await lensToolDef.handler({ lens: "scope" }, deps);
    const text = result.content[0].text;
    assert.ok(text.includes("Scope & Finishing"));
    assert.ok(text.includes("Derek Yu"));
  });

  it("flags unknown lens names as errors with the catalog of ids", async () => {
    const result = await lensToolDef.handler({ lens: "does-not-exist" }, deps);
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("game-feel"));
  });

  it("appends related lenses when both lens and situation are given", async () => {
    const result = await lensToolDef.handler(
      { lens: "juice", situation: "players quit because the game is too hard" }, deps
    );
    const text = result.content[0].text;
    assert.ok(text.includes("Juice & Feedback"));
    assert.ok(text.includes("Also relevant"));
  });

  it("falls back to the catalog for unmatchable situations", async () => {
    const result = await lensToolDef.handler({ situation: "xyzzy plugh" }, deps);
    assert.ok(result.content[0].text.includes("The Designer's Lenses"));
    assert.ok(!result.isError);
  });
});

describe("docs within lens", () => {
  it("situation replies include matching knowledge-base docs", async () => {
    const result = await lensToolDef.handler(
      { situation: "my jump feels floaty" }, deps
    );
    const text = result.content[0].text;
    assert.ok(text.includes("From the knowledge base:"), "docs block missing");
    assert.ok(/`[A-Za-z0-9_-]+` —/.test(text), "doc ids should be listed");
    assert.ok(text.includes('doc: "<id>"'), "fetch hint missing");
  });

  it("design questions surface docs even without a strong lens match", async () => {
    const result = await lensToolDef.handler(
      { situation: "how should I pace and structure my platformer levels" }, deps
    );
    const text = result.content[0].text;
    assert.ok(text.includes("From the knowledge base:"), "docs block missing");
    assert.ok(/level/i.test(text), "expected a level design doc in results");
  });

  it("fetches a small doc in full", async () => {
    const small = deps.allDocs.find((d) => d.content.length < 20_000)!;
    const result = await lensToolDef.handler({ doc: small.id }, deps);
    const text = result.content[0].text;
    assert.ok(!result.isError);
    assert.ok(text.includes(small.title), "doc title header missing");
    assert.ok(!text.includes("table of contents"), "small docs should not be TOC-gated");
  });

  it("TOC-gates oversized docs and honors section extraction", async () => {
    const big = deps.allDocs.find((d) => d.content.length > 30_000 && /^##\s+/m.test(d.content))!;
    const gated = await lensToolDef.handler({ doc: big.id }, deps);
    const gatedText = gated.content[0].text;
    assert.ok(gatedText.includes("table of contents"), "big doc should be TOC-gated");
    assert.ok(gatedText.includes("Sections:"));

    const heading = big.content.match(/^##\s+(.+)$/m)![1].trim();
    const sectioned = await lensToolDef.handler({ doc: big.id, section: heading }, deps);
    const sectionedText = sectioned.content[0].text;
    assert.ok(!sectioned.isError, `section fetch failed for "${heading}"`);
    assert.ok(sectionedText.includes(heading), "requested section heading missing");
    assert.ok(
      sectionedText.length < big.content.length,
      "section should be smaller than the whole doc"
    );
  });

  it("errors helpfully on unknown doc ids", async () => {
    const result = await lensToolDef.handler({ doc: "ZZZ999-nope" }, deps);
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("situation"));
  });

  it("errors with the section list on unknown sections", async () => {
    const big = deps.allDocs.find((d) => /^##\s+/m.test(d.content))!;
    const result = await lensToolDef.handler(
      { doc: big.id, section: "no such heading anywhere" }, deps
    );
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("Sections:"));
  });
});
