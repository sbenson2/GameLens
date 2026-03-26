# LemonSqueezy Storefront Setup Guide

**Purpose:** Step-by-step guide for Wes to set up the LemonSqueezy store and product.
**Status:** Ready to execute once GitHub suspension is resolved.

---

## 1. Store Setup (gamedev-mcp.lemonsqueezy.com)

### Store Name
`GameDev MCP` or `GameDev MCP Server`

### Store Description
> Cross-engine game development knowledge for AI coding assistants. 147+ curated docs on design patterns, architecture, and engine-specific guides — delivered via MCP.

### Store Branding
- **Primary color:** `#6366f1` (indigo — dev-tool standard)
- **Logo:** Use lynx/cat avatar or terminal icon (keep it dev-focused)
- **Favicon:** Terminal or gamepad icon

---

## 2. Product Configuration

### Product: GameDev MCP Pro

| Field | Value |
|-------|-------|
| **Name** | GameDev MCP Pro |
| **Description** | Full access to 147+ curated game development docs across MonoGame, Godot, Unity, and core theory. Unlimited searches, section extraction, cross-engine comparison, and migration guides. |
| **Pricing** | $9/month OR $79/year (save 27%) |
| **Category** | Software — Developer Tools |
| **License key** | ✅ Enabled |
| **Activation limit** | 3 machines (generous for solo devs with desktop + laptop + CI) |
| **Refund policy** | 30-day money-back guarantee |
| **Thank you note** | (see below) |
| **Redirect URL** | `https://github.com/sbenson2/gamedev-mcp-server#pro-setup` |

### Pricing Variants

**Monthly:**
- Name: `Monthly`
- Price: $9.00/month
- Billing interval: Monthly
- License key: Enabled, 3 activations

**Annual:**
- Name: `Annual (Save 27%)`
- Price: $79.00/year
- Billing interval: Yearly
- License key: Enabled, 3 activations

### License Key Settings
- **Key format:** UUID v4 (LemonSqueezy default)
- **Activation limit:** 3
- **Key prefix:** None (standard UUID)

---

## 3. After Store Creation — Update Code

Once the store and product are created, update `src/license.ts`:

```typescript
// Line 36-37: Replace null with actual IDs from LemonSqueezy dashboard
const EXPECTED_STORE_ID: number = XXXXX;    // Dashboard → Settings → Store ID
const EXPECTED_PRODUCT_ID: number = XXXXX;  // Dashboard → Products → Product ID
```

And update `src/tiers.ts`:
```typescript
export const UPGRADE_URL = "https://gamedev-mcp.lemonsqueezy.com/buy/XXXXXXXX";
// Replace with actual checkout link from LemonSqueezy
```

---

## 4. Thank You / Post-Purchase Email

**Subject:** You're in! GameDev MCP Pro activated 🎮

```
Welcome to GameDev MCP Pro!

Your license key: {{license_key}}

## Quick Setup (30 seconds)

### Option A: Environment Variable (recommended)
export GAMEDEV_MCP_LICENSE={{license_key}}

### Option B: Config File
echo '{"key": "{{license_key}}"}' > ~/.gamedev-mcp/license.json

### Option C: Claude Code
claude mcp add gamedev-pro -e GAMEDEV_MCP_LICENSE={{license_key}} -- npx -y gamedev-mcp-server

That's it. Your AI now has full access to 147+ game dev docs.

## What You Unlocked

✅ All engine modules (MonoGame, Godot, Unity when available)
✅ Unlimited searches (no daily limit)  
✅ Section extraction (pull specific sections, not full 80KB docs)
✅ Cross-engine comparison (compare_engines tool)
✅ Migration guides (engine transition guidance)
✅ Genre system lookup (full mapping with recommended docs)
✅ Random doc discovery (explore all modules)

## Need Help?

- Docs: https://github.com/sbenson2/gamedev-mcp-server
- Issues: https://github.com/sbenson2/gamedev-mcp-server/issues
- Email: [support email]

## Pro Tip

Ask your AI: "What Godot docs are available?" — it'll use list_modules 
and list_docs to show you everything. Then dive in with get_doc.

Happy building! 🚀
```

---

## 5. Storefront Page Copy

### Hero Section
**Headline:** Your AI forgets how to make games. Fix that.

**Subheadline:** 147+ curated game development docs delivered through MCP. Design patterns, architecture guides, and engine-specific implementation details — so your AI never loses context.

### Feature Grid

| Feature | Free | Pro |
|---------|------|-----|
| Core docs (programming, design, concepts) | ✅ | ✅ |
| Daily searches | 50/day | Unlimited |
| Daily doc reads | 30/day | Unlimited |
| MonoGame module (79 guides) | — | ✅ |
| Godot module (16 docs) | — | ✅ |
| Section extraction | — | ✅ |
| Cross-engine comparison | — | ✅ |
| Migration guides | — | ✅ |
| Genre system lookup (full) | — | ✅ |
| Future engine modules | — | ✅ |

### Social Proof Section (post-launch)
- "X developers trust GameDev MCP Pro"
- npm download count badge
- GitHub stars badge

### FAQ

**Q: What AI tools does this work with?**
A: Any MCP-compatible tool — Claude Code, Claude Desktop, Cursor, Windsurf, Cline, Copilot, and more.

**Q: Do I need to install anything?**
A: Just `npx gamedev-mcp-server`. Add your license key as an environment variable. Done.

**Q: Can I use it on multiple machines?**
A: Yes — each license supports up to 3 machines (e.g., desktop + laptop + CI).

**Q: What's the refund policy?**
A: 30-day money-back guarantee, no questions asked.

**Q: Will there be more engines?**
A: Yes — Unity is next, with Bevy planned. Pro subscribers get all future engines at no extra cost.

**Q: Is my usage tracked?**
A: Only locally on your machine (for rate limiting). No data leaves your computer. The server runs via stdio — no HTTP, no tracking, no telemetry.

---

## 6. Webhook Setup (Optional, Post-Launch)

Configure LemonSqueezy webhooks to track:
- `subscription_created` — new Pro subscriber
- `subscription_updated` — plan change
- `subscription_cancelled` — churn signal
- `subscription_expired` — expired without renewal
- `license_key_created` — key provisioned

Webhook endpoint: Workers API (`/api/webhook/lemonsqueezy`)

---

## 7. Checklist

- [ ] Create LemonSqueezy account / store
- [ ] Create "GameDev MCP Pro" product with Monthly + Annual variants
- [ ] Enable license key generation (UUID v4, 3 activations)
- [ ] Set thank-you redirect URL
- [ ] Configure post-purchase email template
- [ ] Copy Store ID + Product ID → update `src/license.ts`
- [ ] Copy checkout URL → update `src/tiers.ts` UPGRADE_URL
- [ ] Test: buy with test card → receive key → activate → verify Pro tier
- [ ] Set up webhook endpoint (optional, can do post-launch)
- [ ] Update README "Pro" section with actual checkout link
