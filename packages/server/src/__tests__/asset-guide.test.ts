import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAssetGuide } from "../tools/asset-guide.js";

describe("asset_guide", () => {
  it("should return sprite guide for MonoGame", () => {
    const result = handleAssetGuide({ assetType: "sprite", engine: "monogame" });
    const text = result.content[0].text;
    assert.ok(text.includes("Naming Convention"), "Should have naming section");
    assert.ok(text.includes("Export Settings"), "Should have export section");
    assert.ok(text.includes("Import Steps"), "Should have import steps");
    assert.ok(text.includes("Content.mgcb"), "Should mention MonoGame content pipeline");
  });

  it("should return audio guide for Godot", () => {
    const result = handleAssetGuide({ assetType: "audio", engine: "godot" });
    const text = result.content[0].text;
    assert.ok(text.includes("AudioStreamPlayer"), "Should mention Godot audio nodes");
    assert.ok(text.includes("WAV"), "Should mention WAV format");
  });

  it("should return tilemap guide for Phaser", () => {
    const result = handleAssetGuide({ assetType: "tilemap", engine: "phaser" });
    const text = result.content[0].text;
    assert.ok(text.includes("tilemapTiledJSON"), "Should mention Phaser tilemap loader");
  });

  it("should include source tool tips", () => {
    const result = handleAssetGuide({ assetType: "spritesheet", engine: "godot", sourceTool: "aseprite" });
    const text = result.content[0].text;
    assert.ok(text.includes("Aseprite"), "Should have Aseprite section");
    assert.ok(text.includes("Export Sprite Sheet"), "Should have export tips");
  });

  it("should handle asset type aliases", () => {
    const result = handleAssetGuide({ assetType: "sfx", engine: "phaser" });
    const text = result.content[0].text;
    assert.ok(text.includes("audio"), "Should resolve 'sfx' to audio guide");
  });

  it("should handle engine aliases", () => {
    const result = handleAssetGuide({ assetType: "sprite", engine: "godot4" });
    const text = result.content[0].text;
    assert.ok(text.includes("Godot"), "Should resolve godot4 alias");
  });

  it("should reject unknown engine", () => {
    const result = handleAssetGuide({ assetType: "sprite", engine: "unity" });
    const text = result.content[0].text;
    assert.ok(text.includes("Unknown engine"), "Should reject unknown engine");
  });

  it("should reject unknown asset type", () => {
    const result = handleAssetGuide({ assetType: "3d-model", engine: "godot" });
    const text = result.content[0].text;
    assert.ok(text.includes("No guide"), "Should reject unknown asset type");
    assert.ok(text.includes("Supported types"), "Should list supported types");
  });

  it("should cover all asset types for all engines", () => {
    const types = ["sprite", "spritesheet", "audio", "tilemap", "font", "particle"];
    const engines = ["monogame", "godot", "phaser"];
    for (const engine of engines) {
      for (const assetType of types) {
        const result = handleAssetGuide({ assetType, engine });
        const text = result.content[0].text;
        assert.ok(text.includes("Import Steps"), `${engine}/${assetType} should have import steps`);
      }
    }
  });
});
