# Security Policy

## Supported Versions

| Version | Supported               |
| ------- | ----------------------- |
| 3.x     | ✅ Active support       |
| < 3.0.0 | ❌ Not supported (published as `gamecodex`) |

## Architecture Security

GameLens is designed with security as a core principle:

- **stdio-only transport** — No HTTP server, no open ports, no network attack surface. Communication happens exclusively through stdin/stdout with the MCP client process.
- **Read-only knowledge delivery** — The server serves design lenses and documentation. It cannot modify files, execute commands, or access system resources beyond reading its bundled docs.
- **Minimal runtime dependencies** — Two dependencies: `@modelcontextprotocol/sdk` (MCP protocol) and `zod` (input validation). No eval, no shell execution, no arbitrary file writes.
- **No data collection** — The server does not phone home, collect telemetry, or transmit any user data. Usage analytics are local JSON files under `~/.gamelens/analytics/`, never uploaded, and can be disabled with `GAMELENS_ANALYTICS=false`.

### Why This Matters

Most MCP vulnerabilities target **remote HTTP MCP servers** with open ports, no authentication, and broad tool permissions.

GameLens avoids this entire attack class by design:
- No HTTP listener → no remote exploitation
- No write tools → no prompt injection can cause damage
- No secrets in context → no exfiltration risk
- stdio transport → process-level isolation by the MCP client

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. Use GitHub's [private vulnerability reporting](https://github.com/sbenson2/GameLens/security/advisories/new)
2. **Do NOT** open a public issue for security vulnerabilities
3. Include steps to reproduce and potential impact

We will acknowledge reports within 48 hours and aim to release fixes within 7 days for critical issues.

## Supply Chain Security

- **npm audit** runs in CI on every build
- **npm publish with provenance** — Published packages include attestations so you can verify the package was built from this repository
- **Dependency review** — PR-time checks flag known vulnerabilities in new/updated dependencies

## Verification

Verify the published npm package was built from this repo:

```bash
npm audit signatures
```
