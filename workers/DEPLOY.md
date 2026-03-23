# Workers API Deployment Guide

## Prerequisites

1. Cloudflare account with Workers enabled (free tier is fine)
2. `wrangler` CLI authenticated: `npx wrangler login`
3. KV namespaces created (one-time setup)

## One-Time Setup

### 1. Create KV Namespaces

```bash
cd workers
npx wrangler kv namespace create DOCS_KV
npx wrangler kv namespace create CACHE_KV
```

Copy the namespace IDs from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "DOCS_KV"
id = "<your-docs-kv-id>"
preview_id = "<your-docs-kv-preview-id>"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "<your-cache-kv-id>"
preview_id = "<your-cache-kv-preview-id>"
```

### 2. Set Secrets

```bash
npx wrangler secret put LEMONSQUEEZY_WEBHOOK_SECRET
```

### 3. Update wrangler.toml vars

Set `LEMONSQUEEZY_STORE_ID` to your LemonSqueezy store ID.

## Deploy

### Manual Deploy

```bash
cd workers

# Generate KV data from docs
npx tsx scripts/upload-docs.ts --write

# Deploy the Worker
npx wrangler deploy

# Upload docs to KV
npx wrangler kv bulk put --binding DOCS_KV kv-bulk.json --remote

# Verify
curl https://gamedev-mcp-api.<account>.workers.dev/v1/health
```

### CI Deploy (GitHub Actions)

Set these repository secrets:
- `CLOUDFLARE_API_TOKEN` — API token with Workers + KV permissions
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID

The `deploy-workers.yml` workflow runs on:
- Manual dispatch (workflow_dispatch)
- Push to main when `workers/` or `docs/` files change

### Custom Domain

After first deploy, add a custom domain in the Cloudflare dashboard:
Workers & Pages → gamedev-mcp-api → Settings → Domains & Routes → Add Custom Domain

## Updating Docs

When docs change, regenerate and re-upload KV data:

```bash
cd workers
npx tsx scripts/upload-docs.ts --write
npx wrangler kv bulk put --binding DOCS_KV kv-bulk.json --remote
```

The CI workflow handles this automatically on push.

## Local Development

```bash
cd workers
npx tsx scripts/upload-docs.ts --write
npx wrangler kv bulk put --binding DOCS_KV kv-bulk.json --local --preview
npx wrangler dev
# API available at http://localhost:8787
```

## Monitoring

- **Logs**: `npx wrangler tail` (live logs from production)
- **Analytics**: Cloudflare dashboard → Workers → Analytics
- **KV metrics**: Dashboard → Workers → KV → Usage
