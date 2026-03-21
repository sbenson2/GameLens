# Stitch Prompts — gamedev-mcp-server Marketing

Google Stitch prompt templates for designing marketing/product pages for the gamedev-mcp-server project. Use at [stitch.withgoogle.com](https://stitch.withgoogle.com/).

---

## 1. Product Landing Page

### Primary Prompt

```
Modern developer tool landing page for "gamedev-mcp-server" — an AI 
knowledge server for game development. 

Hero section: Large heading "Your AI forgets everything mid-project. 
Fix that." with subheading "Curated gamedev knowledge delivered to your 
AI assistant via MCP. MonoGame · Godot · Unity." and a prominent 
"Get Started — npx gamedev-mcp-server" code snippet button. Dark 
background (#0d1117) with a subtle grid pattern.

Below hero: Three feature cards in a row:
1. "130+ Guides" — icon: book — "Combat, UI, physics, networking, 
   and 120+ more topics. Written for AI consumption."
2. "Cross-Engine" — icon: layers — "MonoGame, Godot, Unity. One 
   server, all the knowledge your AI needs."  
3. "Context-Efficient" — icon: zap — "Section extraction, smart 
   search, minimal token usage. Your AI gets exactly what it needs."

Social proof section: "Used by indie devs, game jam teams, and 
solo developers building with AI coding assistants."

Clean, minimal design. Color scheme: dark navy (#0d1117) background, 
white text, electric blue (#58a6ff) accent, green (#3fb950) for 
CTA buttons. Developer-focused, not corporate.
```

### Alternative Hero Variants

```
# Variant A — Problem-focused
Hero heading: "AI writes great game code — for about 5 minutes." 
Subheading: "Then it forgets your architecture, invents APIs, and 
hallucinates patterns. gamedev-mcp-server gives your AI permanent 
gamedev knowledge."

# Variant B — Command-line focused  
Hero: Giant terminal window showing:
$ npx gamedev-mcp-server
✓ Loaded 130 docs across 3 engine modules
✓ MonoGame (76 guides) · Godot (5 guides) · Core (49 guides)
✓ Ready — your AI now knows game development

# Variant C — Before/After
Split hero: Left side (red tint): "Without gamedev-mcp-server" — 
AI output with wrong API calls, deprecated patterns, hallucinated 
functions. Right side (green tint): "With gamedev-mcp-server" — 
correct MonoGame/Godot code with proper patterns.
```

### Sections Below the Fold

```
# Features section prompt
Expand the landing page with a features section. Four rows, each 
with an icon, heading, description, and code example:

Row 1: "Smart Search" — TF-IDF search across 130+ docs. Example 
query: search_docs("camera shake platformer") → G20 Camera Systems §Shake

Row 2: "Section Extraction" — Don't dump 85KB docs. Get just the 
section you need. Example: get_doc("G64", section: "Knockback")

Row 3: "Module Discovery" — Auto-discovers engine modules. Add 
docs/unity-arch/ and Unity is instantly available.

Row 4: "Free + Pro Tiers" — Core guides free. Advanced patterns, 
genre systems, and full engine modules for $9/month.

Same dark developer aesthetic. Code examples in syntax-highlighted 
code blocks.
```

```
# Pricing section prompt
Pricing section for the same landing page. Two-tier comparison:

FREE tier (outlined card):
- 49 core guides (AI workflow, game design, programming patterns)
- Basic search (5 queries/day)
- Community support
- "Get Started Free" button

PRO tier ($9/month, filled/highlighted card):
- Everything in Free
- 130+ guides (MonoGame, Godot, Unity)
- Unlimited search
- Section extraction for context-efficient queries
- Priority support
- "Start Pro Trial" button (green accent)

Annual option: $79/year (save 27%) toggle above the cards.
Clean, not aggressive. The free tier should feel genuinely useful, 
not crippled.
```

---

## 2. LemonSqueezy Storefront Layout

### Product Page Prompt

```
Clean product page for a developer subscription service on a 
marketplace/storefront. Product: "gamedev-mcp-server Pro" at $9/month.

Top: Product name and tagline "AI-native game development knowledge"

Left column (60%): 
- Product description with bullet points
- Feature list with checkmarks
- "What's included" expandable sections:
  - MonoGame Module (76 guides)
  - Godot Module (5 guides, growing weekly)  
  - Core Module (49 guides)
  - Search & Section Extraction
- FAQ section (Is this a subscription? Can I cancel? What AI tools 
  does this work with?)

Right column (40%): 
- Sticky pricing card
- Price: $9/month or $79/year (toggle)
- "Subscribe" button (prominent)
- "✓ Cancel anytime" 
- "✓ 130+ guides and growing"
- "✓ Works with Claude, Cursor, Cline, Windsurf"
- Supported payment badges

Style: Clean white/light background, dark text, blue accent 
for CTAs. Professional but indie-friendly. Not enterprise.
```

### Checkout Flow

```
Minimal checkout overlay for a $9/month developer tool subscription.
Fields: Email, Card details, Country.
Order summary sidebar: "gamedev-mcp-server Pro — $9/month"
Apply coupon code field.
"Subscribe" button.
"Powered by LemonSqueezy" badge at bottom.
Trust indicators: "Cancel anytime" · "Secure checkout" · "Receipt via email"
Clean, fast, no distractions. White background, minimal design.
```

---

## 3. README Hero Image Concept

### Terminal-Style Hero

```
Wide banner image (1200x400) for a GitHub README. Dark background 
(#0d1117 GitHub dark mode).

Center: Stylized terminal window with the command:
$ npx gamedev-mcp-server

Below the command, colorful output lines:
🎮 gamedev-mcp-server v1.1.0
📚 Loaded 3 modules: MonoGame (76) · Godot (5) · Core (49)  
🔍 Search ready — 130 docs indexed
✅ MCP server running

Subtle decorative elements: game-related icons floating around 
the terminal (pixel sword, controller, potion bottle, gear/cog) 
in muted colors.

No text outside the terminal — the terminal IS the hero.
```

### Architecture Diagram Hero

```
Wide banner (1200x400) showing the data flow:

Left side: AI Assistant icons (Claude, Cursor, Cline logos as 
simple shapes)

Center: Arrow → "gamedev-mcp-server" box (highlighted, primary 
accent color)

Right side: Three module boxes:
- "MonoGame" with 76 badge
- "Godot" with 5 badge  
- "Core" with 49 badge

Below the flow: "130+ curated game development guides, delivered 
via MCP"

Dark background, clean lines, developer-tool aesthetic.
Not playful — professional and technical.
```

### Split Comparison Hero

```
Wide banner (1200x400) split down the middle with a diagonal line.

Left side (reddish tint, "WITHOUT"):
Code snippet showing wrong MonoGame API:
body.SetRestitution(0.5f); // ← Deprecated
yield return new WaitForSeconds(1); // ← Wrong engine
var rb = GetComponent<Rigidbody2D>(); // ← That's Unity

Right side (greenish tint, "WITH"):
Code snippet showing correct patterns:
fixture.Restitution = 0.5f; // ✓ Aether.Physics2D
await Task.Delay(1000); // ✓ C# async
var body = world.CreateBody(); // ✓ Correct API

Divider text: "gamedev-mcp-server" logo/text on the diagonal.
```

---

## 4. Social Media / Promotional Graphics

### Twitter/X Card

```
Social media card (1200x628) for promoting the product.
Dark background.
Large text: "Your AI writes better game code when it has 
the right knowledge."
Smaller text: "130+ curated guides for MonoGame, Godot & Unity."
Bottom: "npx gamedev-mcp-server" in a code pill.
Product logo or icon in corner.
```

### Discord Embed Preview

```
Small preview card (400x200) for link embeds.
Left: Small icon/logo (game controller + book).
Title: "gamedev-mcp-server"
Description: "AI-native game development knowledge server. 
130+ guides. Free & Pro tiers."
Footer: "stitch.withgoogle.com" (or actual URL)
Dark card matching Discord dark mode.
```

---

## Usage Notes

- All prompts designed for Google Stitch at [stitch.withgoogle.com](https://stitch.withgoogle.com/)
- Use vibe design for initial exploration, then refine with specific prompts above
- Export HTML/CSS for reference when building actual pages
- For the README hero, export as image (screenshot the Stitch output) or recreate in SVG
- The landing page can be implemented directly from Stitch's HTML/CSS output with minor modifications
- For LemonSqueezy, use the design as visual reference — the actual storefront uses LemonSqueezy's template system
