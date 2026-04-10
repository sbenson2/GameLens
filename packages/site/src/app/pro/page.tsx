import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GameCodex Pro — Unlock All Tools",
  description: "GameCodex Pro ($7/mo) unlocks project management, GDD generation, code scaffolding, debug diagnosis, and more. Full knowledge base stays free forever.",
};

const FREE_FEATURES = [
  "950+ curated game dev docs",
  "All 29 engine modules",
  "Search, browse, and read any doc",
  "Server diagnostics and status",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Project goals, decisions, scope health",
  "GDD generation, phase checklists",
  "Marketing, store pages, launch prep",
  "Code scaffolding and starter code",
  "Debug diagnosis and architecture review",
  "Session workflow orchestration",
];

const FAQ = [
  {
    q: "How many machines can I use?",
    a: "Up to 3 activations per license — enough for a laptop, desktop, and CI. Run `gamecodex deactivate` to free a slot.",
  },
  {
    q: "How do I activate?",
    a: "After purchase, you'll get a license key. Run `gamecodex setup` in your terminal and paste it. That's it.",
  },
  {
    q: "How do I cancel?",
    a: "Cancel any time from your LemonSqueezy account. Your Pro access continues until the end of the billing period.",
  },
  {
    q: "What if I'm offline?",
    a: "GameCodex caches your license locally. You get a 7-day grace period if it can't reach the server.",
  },
  {
    q: "Is the free tier limited?",
    a: "No artificial limits. Free gives you full access to all 950+ docs across 29 engines. Pro adds the workflow tools.",
  },
];

export default function ProPage() {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Hero */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="section-title" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
            GameCodex <span className="hero-gradient-text">Pro</span>
          </h1>
          <p className="section-sub" style={{ maxWidth: 600 }}>
            Full knowledge base. Free forever. Pro unlocks the tools that turn knowledge into shipped games.
          </p>
          <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="https://gamecodex.lemonsqueezy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="pricing-cta-pro"
              style={{ display: "inline-block" }}
            >
              Get Pro — $7/month
            </a>
          </div>
        </div>
      </section>

      {/* Feature comparison */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="pricing-card">
            <div className="pricing-tier">Free</div>
            <div className="pricing-price">$0<span className="pricing-period">/forever</span></div>
            <ul className="pricing-features">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="pricing-feature pricing-included">{f}</li>
              ))}
            </ul>
          </div>
          <div className="pricing-card pricing-card-pro">
            <div className="pricing-badge">Most Popular</div>
            <div className="pricing-tier">Pro</div>
            <div className="pricing-price">$7<span className="pricing-period">/month</span></div>
            <ul className="pricing-features">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="pricing-feature pricing-included">{f}</li>
              ))}
            </ul>
            <a
              href="https://gamecodex.lemonsqueezy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="pricing-cta-pro"
            >
              Get Pro
            </a>
          </div>
        </div>
      </section>

      {/* Already have a key */}
      <section className="py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="section-title" style={{ fontSize: "1.5rem" }}>Already have a key?</h2>
          <div style={{
            background: "var(--card-bg, rgba(255,255,255,0.04))",
            border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
            borderRadius: "12px",
            padding: "2rem",
            marginTop: "1.5rem",
            textAlign: "left",
          }}>
            <p style={{ color: "var(--smoke)", lineHeight: 1.8, fontFamily: "monospace", fontSize: "0.95rem" }}>
              <span style={{ color: "var(--white)" }}>$</span> gamecodex setup<br />
              <span style={{ color: "var(--smoke)", opacity: 0.6 }}>  License key: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</span><br />
              <span style={{ color: "var(--smoke)", opacity: 0.6 }}>  Activating...</span><br />
              <span style={{ color: "#4ade80" }}>  Pro activated!</span>
            </p>
          </div>
          <p style={{ color: "var(--smoke)", marginTop: "1rem", fontSize: "0.9rem" }}>
            Or set <code style={{ color: "var(--white)" }}>GAMECODEX_LICENSE=your-key</code> in your shell profile.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="section-title" style={{ fontSize: "1.5rem", textAlign: "center", marginBottom: "2rem" }}>FAQ</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {FAQ.map(({ q, a }) => (
              <div key={q} style={{
                background: "var(--card-bg, rgba(255,255,255,0.04))",
                border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
                borderRadius: "12px",
                padding: "1.5rem",
              }}>
                <h3 style={{ color: "var(--white)", fontWeight: 600, marginBottom: "0.5rem" }}>{q}</h3>
                <p style={{ color: "var(--smoke)", lineHeight: 1.6 }}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="py-12 px-6 text-center">
        <p style={{ color: "var(--smoke)", fontSize: "0.85rem" }}>
          Need help? <a href="mailto:support@gamecodex.dev" style={{ color: "var(--white)" }}>support@gamecodex.dev</a>
          {" "} · {" "}
          <Link href="/" style={{ color: "var(--white)" }}>Back to home</Link>
        </p>
      </section>
    </main>
  );
}
