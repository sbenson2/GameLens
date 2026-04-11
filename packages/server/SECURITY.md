# Security Policy

## Supported Versions

| Version | Supported               |
| ------- | ----------------------- |
| 0.4.x   | ✅ Active support       |
| 0.3.x   | 🔧 Maintenance only     |
| < 0.3.0 | ❌ Not supported        |

## Architecture Security

GameCodex MCP Server is designed with security as a core principle:

- **stdio-only transport** — No HTTP server, no open ports, no network attack surface. Communication happens exclusively through stdin/stdout with the MCP client process.
- **Read-only knowledge delivery** — The server serves documentation. It cannot modify files, execute commands, or access system resources beyond reading its bundled docs.
- **Minimal runtime dependencies** — Two required dependencies (`@modelcontextprotocol/sdk` for MCP protocol, `fastest-levenshtein` for fuzzy matching). One optional dependency (`@huggingface/transformers` for vector search). No eval, no shell execution, no arbitrary file writes.
- **No data collection** — The server does not phone home, collect telemetry, or transmit any user data. License validation (Pro tier only) is the sole outbound network call, and it's optional.

### Why This Matters

The MCP ecosystem has faced scrutiny over security ([RSAC 2026 MCPwned](https://dark-reading.com), [Qualys TotalAI fingerprinting](https://qualys.com)). Most vulnerabilities target **remote HTTP MCP servers** with open ports, no authentication, and broad tool permissions.

GameCodex MCP Server avoids this entire attack class by design:
- No HTTP listener → no remote exploitation
- No write tools → no prompt injection can cause damage
- No secrets in context → no exfiltration risk
- stdio transport → process-level isolation by the MCP client

## Optional Dependencies

`@huggingface/transformers` is listed as an **optional dependency** for semantic vector search. It is not required — without it, the server uses TF-IDF keyword search, which works well for most use cases.

If installed, it pulls in transitive dependencies (onnxruntime-node, sharp) that may trigger supply chain alerts on tools like Socket.dev. These alerts reflect the legitimate architecture of ML libraries (binary downloads, model caching, native compilation) and are expected. Hugging Face is a reputable, widely-used ML infrastructure provider.

**What the alerts mean:**
- **Network access** — Downloads ONNX model files on first use, cached locally thereafter
- **Filesystem access** — Caches models at `~/.gamecodex/models/` for performance
- **Install scripts** — onnxruntime-node and sharp use postinstall scripts to compile platform-specific binaries
- **Environment variable access** — Reads `HF_HOME` and `HF_TOKEN` for cache/auth configuration

**What GameCodex itself does NOT do:**
- No `eval()` or dynamic code execution
- No shell/child_process access
- No arbitrary file writes (only reads bundled docs, writes to `~/.gamecodex/`)
- No outbound network calls except optional license validation

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Email**: security@gamecodex.dev *(or open a confidential issue on [GitLab](https://github.com/sbenson2/GameCodex/-/issues))*
2. **Do NOT** open a public issue for security vulnerabilities
3. Include steps to reproduce and potential impact

We will acknowledge reports within 48 hours and aim to release fixes within 7 days for critical issues.

## Supply Chain Security

- **npm audit** runs in CI on every build
- **npm publish with provenance** — Published packages include attestations so you can verify the package was built from this repository
- **Dependency review** — MR-time checks flag known vulnerabilities in new/updated dependencies

## Verification

Verify the published npm package was built from this repo:

```bash
npm audit signatures
```
