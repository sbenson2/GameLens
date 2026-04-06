import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidKeyFormat, isValidCacheShape } from "../license.js";

describe("License key format validation", () => {
  it("should accept valid UUID v4 format keys", () => {
    assert.ok(isValidKeyFormat("550e8400-e29b-41d4-a716-446655440000"));
    assert.ok(isValidKeyFormat("6ba7b810-9dad-11d1-80b4-00c04fd430c8"));
    assert.ok(isValidKeyFormat("f47ac10b-58cc-4372-a567-0e02b2c3d479"));
  });

  it("should accept uppercase UUID keys (case-insensitive)", () => {
    assert.ok(isValidKeyFormat("550E8400-E29B-41D4-A716-446655440000"));
    assert.ok(isValidKeyFormat("F47AC10B-58CC-4372-A567-0E02B2C3D479"));
  });

  it("should reject empty strings", () => {
    assert.ok(!isValidKeyFormat(""));
  });

  it("should reject non-UUID formats", () => {
    assert.ok(!isValidKeyFormat("not-a-valid-key"));
    assert.ok(!isValidKeyFormat("12345"));
    assert.ok(!isValidKeyFormat("abcd-efgh-ijkl-mnop-qrst"));
  });

  it("should reject keys with wrong segment lengths", () => {
    // Missing a segment
    assert.ok(!isValidKeyFormat("550e8400-e29b-41d4-a716"));
    // Extra segment
    assert.ok(!isValidKeyFormat("550e8400-e29b-41d4-a716-446655440000-extra"));
    // Wrong segment length
    assert.ok(!isValidKeyFormat("550e840-e29b-41d4-a716-446655440000"));
  });

  it("should reject keys with invalid characters", () => {
    assert.ok(!isValidKeyFormat("550g8400-e29b-41d4-a716-446655440000")); // 'g' not hex
    assert.ok(!isValidKeyFormat("550e8400-e29b-41d4-a716-44665544000z"));
  });

  it("should reject keys with spaces or padding", () => {
    assert.ok(!isValidKeyFormat(" 550e8400-e29b-41d4-a716-446655440000"));
    assert.ok(!isValidKeyFormat("550e8400-e29b-41d4-a716-446655440000 "));
  });
});

describe("Cache shape validation", () => {
  const validEntry = {
    valid: true,
    keyHash: "abc123def456",
    validatedAt: Date.now(),
    instanceId: "user@host (darwin/arm64)",
  };

  it("should accept a valid cache entry with required fields only", () => {
    assert.ok(isValidCacheShape(validEntry));
  });

  it("should accept a valid cache entry with all optional fields", () => {
    assert.ok(isValidCacheShape({
      ...validEntry,
      activationLimit: 5,
      activationsUsed: 2,
      expiresAt: "2026-12-31T00:00:00Z",
    }));
  });

  it("should reject null", () => {
    assert.ok(!isValidCacheShape(null));
  });

  it("should reject non-objects", () => {
    assert.ok(!isValidCacheShape("string"));
    assert.ok(!isValidCacheShape(42));
    assert.ok(!isValidCacheShape(true));
    assert.ok(!isValidCacheShape(undefined));
  });

  it("should reject empty object (missing required fields)", () => {
    assert.ok(!isValidCacheShape({}));
  });

  it("should reject when valid is not boolean", () => {
    assert.ok(!isValidCacheShape({ ...validEntry, valid: "true" }));
    assert.ok(!isValidCacheShape({ ...validEntry, valid: 1 }));
  });

  it("should reject when keyHash is not string", () => {
    assert.ok(!isValidCacheShape({ ...validEntry, keyHash: 123 }));
  });

  it("should reject when validatedAt is not number", () => {
    assert.ok(!isValidCacheShape({ ...validEntry, validatedAt: "2026-01-01" }));
  });

  it("should reject when instanceId is not string", () => {
    assert.ok(!isValidCacheShape({ ...validEntry, instanceId: null }));
  });

  it("should reject when optional fields have wrong types", () => {
    assert.ok(!isValidCacheShape({ ...validEntry, activationLimit: "5" }));
    assert.ok(!isValidCacheShape({ ...validEntry, activationsUsed: true }));
    assert.ok(!isValidCacheShape({ ...validEntry, expiresAt: 12345 }));
  });

  it("should accept when optional fields are undefined", () => {
    assert.ok(isValidCacheShape({
      ...validEntry,
      activationLimit: undefined,
      activationsUsed: undefined,
      expiresAt: undefined,
    }));
  });
});
