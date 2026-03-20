# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-19

### Added
- Initial release on npm
- 120+ curated game dev docs (core + MonoGame/Arch ECS)
- TF-IDF search engine with hyphen tokenization, stop words, stemming, C# token handling
- Doc length normalization (sqrt unique terms) and title scoring (+5 per-token boost)
- Genre lookup tool with 11 genre profiles
- Session co-pilot (plan, decide, feature, debug, scope workflows)
- Free/Pro tier system with LemonSqueezy license validation
- Rate limiting for free tier (search + get_doc)
- Dev mode (`GAMEDEV_MCP_DEV=true`) for local development
- Section extraction and `maxLength` params for `get_doc`
- Godot module (Phase 2): E1, godot-rules, G1-G3
- MonoGame guides G64-G67 (combat, economy, building, object pooling)
- Core concept: networking-theory
