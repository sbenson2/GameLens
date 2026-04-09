# R3 — Migration Patterns & Version Management

> **Category:** reference · **Engine:** Bevy 0.18 · **Related:** [G1 Getting Started](../guides/G1_getting_started.md) · [R1 Plugins & WASM](R1_plugins_and_wasm.md) · [R2 Community Plugins](R2_community_plugins_ecosystem.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy follows a rapid release cycle (~3–4 months per minor version) with frequent breaking changes. Every release includes an official migration guide. This doc covers strategies for staying current, common breaking change patterns, and practical migration workflows.

---

## Bevy's Release Cadence

| Version | Release Date | Key Theme |
|---------|-------------|-----------|
| 0.15 | Dec 2024 | Required Components, new UI layout |
| 0.16 | Apr 2025 | Retained rendering, curve-based animation |
| 0.17 | Sep 2025 | Immutable components, camera-driven rendering |
| 0.18 | Jan 2026 | Cargo feature collections, procedural atmosphere, UI navigation |

Expect breaking changes in every minor release. Bevy does not follow semver stability guarantees yet — `0.x` means the API is still evolving.

---

## Migration Workflow

### Step 1: Read the Official Guide First

Every release has a detailed migration guide at:
```
https://bevy.org/learn/migration-guides/0-{OLD}-to-0-{NEW}/
```

For 0.17 → 0.18: https://bevy.org/learn/migration-guides/0-17-to-0-18/

### Step 2: Update Dependencies Methodically

```toml
# Cargo.toml — update bevy AND all bevy-ecosystem crates together
[dependencies]
bevy = "0.18"
# Community crates must match! Check their changelogs.
bevy-inspector-egui = "0.36"     # Must match Bevy 0.18
bevy_rapier3d = "0.29"           # Check rapier compatibility
bevy_egui = "0.36"               # Tracks inspector version
```

> **Critical:** Don't update `bevy` alone. Community crates pin to specific Bevy versions. Updating Bevy without updating plugins causes cryptic trait-mismatch compile errors.

### Step 3: Fix Compiler Errors Categorically

Rather than fixing errors one-by-one, batch them by category:

```bash
# Get a full list of errors without stopping at the first
cargo check 2>&1 | head -200
```

Common error categories (see sections below):
1. Renamed types/functions
2. Changed system signatures
3. Removed re-exports
4. New required derives/traits

### Step 4: Run Tests, Then Spot-Check Visually

```bash
cargo test
cargo run  # visual sanity check — rendering changes are subtle
```

---

## Common Breaking Change Patterns

### Pattern 1: Renamed APIs

Bevy frequently renames things for clarity. These are mechanical fixes.

**0.17 → 0.18 example — Entity terminology:**
```rust
// Before (0.17)
let row = entity.row();
let e = Entity::from_row(42);

// After (0.18) — "row" renamed to "index"
let index = entity.index();
let e = Entity::from_index(42);
```

**Strategy:** Use find-and-replace. The migration guide lists every rename.

### Pattern 2: Removed Re-exports

Bevy sometimes stops re-exporting third-party crates to avoid version conflicts.

**0.17 → 0.18 example — `ron` crate:**
```toml
# Before: ron was re-exported through bevy_scene
# After: add it as a direct dependency
[dependencies]
ron = "0.8"
```

```rust
// Before (0.17)
use bevy::scene::ron;

// After (0.18)
use ron;
```

**Strategy:** When you see "unresolved import" errors for third-party types, add the crate directly to your `Cargo.toml`.

### Pattern 3: Restructured Cargo Features

Bevy 0.18 introduced high-level feature collections (`2d`, `3d`, `ui`) and mid-level collections (`2d_api`, `3d_api`, `default_app`, `default_platform`).

```toml
# Before (0.17) — manual feature selection
[dependencies]
bevy = { version = "0.17", default-features = false, features = [
    "bevy_winit", "bevy_render", "bevy_sprite", "bevy_text",
    "bevy_ui", "bevy_asset", "png"
]}

# After (0.18) — use high-level feature collections
[dependencies]
bevy = { version = "0.18", default-features = false, features = [
    "2d", "ui"
]}
```

### Pattern 4: Trait/Derive Changes

New required traits or changed derive macros.

**0.17 → 0.18 example — EntityEvent:**
```rust
// Before (0.17) — EntityEvent had mutable methods directly
impl EntityEvent for MyEvent { ... }

// After (0.18) — Mutable methods moved to SetEntityEventTarget trait
// SetEntityEventTarget is auto-implemented for propagated events
```

### Pattern 5: Behavioral Changes

These are the hardest to catch — same API, different behavior.

**0.17 → 0.18 example — Text picking:**
```rust
// Before (0.17): The entire text node bounding box was pickable
// After (0.18): Only text-containing regions are pickable
// Fix: Wrap text in a parent node if you need full-box picking
commands.spawn((
    Node { width: Val::Px(200.0), height: Val::Px(50.0), ..default() },
    Interaction::default(), // Catches clicks on full box
)).with_children(|parent| {
    parent.spawn(Text::new("Click me"));
});
```

**Strategy:** These require reading the migration guide carefully and visual testing.

---

## Automated Migration Assistance

### ast-grep for Mechanical Renames

The [`ast-grep`](https://ast-grep.github.io/) tool can automate pattern-based code transformations:

```yaml
# .ast-grep/rules/entity-row-to-index.yml
id: entity-row-to-index
language: rust
rule:
  pattern: $E.row()
fix: $E.index()
```

```bash
ast-grep scan --rule .ast-grep/rules/entity-row-to-index.yml
ast-grep scan --rule .ast-grep/rules/entity-row-to-index.yml --update-all
```

### Compiler-Driven Migration

Rust's compiler is your best migration tool. This workflow is effective:

```bash
# 1. Update Cargo.toml
# 2. Run cargo check — collect ALL errors
cargo check 2>&1 | grep "error\[" | sort | uniq -c | sort -rn
# 3. Fix the most common error type first (biggest batch)
# 4. Repeat until clean
```

---

## Version Pinning Strategy

### For Game Projects (Ship Date Pressure)

Pin to a specific version and only update when you have time to fix breakage:

```toml
bevy = "=0.18.1"  # Exact version pin
```

### For Library/Plugin Authors

Support the latest Bevy version. Use feature flags to support multiple versions if needed:

```toml
[features]
bevy_0_18 = ["bevy/0.18"]
bevy_0_17 = ["bevy/0.17"]
```

### Pre-Release Testing

Track Bevy's `main` branch or release candidates to prepare early:

```toml
# Test against main (expect breakage)
bevy = { git = "https://github.com/bevyengine/bevy", branch = "main" }
```

---

## Resources

| Resource | URL |
|----------|-----|
| Official migration guides | `bevy.org/learn/migration-guides/` |
| Bevy changelog | `github.com/bevyengine/bevy/releases` |
| This Week in Bevy | `thisweekinbevy.com` (weekly ecosystem updates) |
| ast-grep Bevy migrations | `ast-grep.github.io/blog/migrate-bevy.html` |
| Unofficial Bevy Cheat Book | `bevy-cheatbook.github.io` |

---

## Checklist: Upgrading Bevy Version

1. [ ] Read the official migration guide end-to-end
2. [ ] Update `bevy` version in `Cargo.toml`
3. [ ] Update ALL community crate versions to match
4. [ ] Run `cargo check` — batch-fix errors by category
5. [ ] Run `cargo test` — fix failing tests
6. [ ] Visual spot-check — rendering and UI behaviors may have changed
7. [ ] Update any `#[cfg(feature)]` gates for new/removed features
8. [ ] Update your `Cargo.toml` feature selections if using non-default features
9. [ ] Test WASM build if targeting web (`cargo build --target wasm32-unknown-unknown`)
