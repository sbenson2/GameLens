# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | ✅ Active support  |
| < 1.0.0 | ❌ Not supported   |

## Architecture Security

GameDev MCP Server is designed with security as a core principle:

- **stdio-only transport** — No HTTP server, no open ports, no network attack surface. Communication happens exclusively through stdin/stdout with the MCP client process.
- **Read-only knowledge delivery** — The server serves documentation. It cannot modify files, execute commands, or access system resources beyond reading its bundled docs.
- **Zero external runtime dependencies** — No third-party packages are loaded at runtime that could introduce supply chain vulnerabilities.
- **No data collection** — The server does not phone home, collect telemetry, or transmit any user data. License validation (Pro tier only) is the sole outbound network call, and it's optional.

### Why This Matters

The MCP ecosystem has faced scrutiny over security ([RSAC 2026 MCPwned](https://dark-reading.com), [Qualys TotalAI fingerprinting](https://qualys.com)). Most vulnerabilities target **remote HTTP MCP servers** with open ports, no authentication, and broad tool permissions.

GameDev MCP Server avoids this entire attack class by design:
- No HTTP listener → no remote exploitation
- No write tools → no prompt injection can cause damage
- No secrets in context → no exfiltration risk
- stdio transport → process-level isolation by the MCP client

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Email**: security@gamecodex.dev *(or open a private security advisory on GitHub)*
2. **Do NOT** open a public issue for security vulnerabilities
3. Include steps to reproduce and potential impact

We will acknowledge reports within 48 hours and aim to release fixes within 7 days for critical issues.

## Supply Chain Security

- **Dependabot** monitors dependencies weekly (npm packages + GitHub Actions)
- **CodeQL** runs static analysis on every push and weekly
- **npm audit** runs in CI on every build
- **npm publish with provenance** — Published packages include [SLSA provenance](https://slsa.dev/) attestations via GitHub Actions OIDC, so you can verify the package was built from this repository
- **Dependency review** — PR-time checks flag known vulnerabilities in new/updated dependencies

## Verification

Verify the published npm package was built from this repo:

```bash
npm audit signatures
```
