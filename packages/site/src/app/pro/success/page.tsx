import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Welcome to GameCodex Pro!",
  description: "You're all set. Here's how to activate your license.",
};

const STEPS = [
  {
    num: "1",
    title: "Copy your license key",
    desc: "It's on this page (scroll up) and in your email receipt from LemonSqueezy.",
  },
  {
    num: "2",
    title: "Run the setup command",
    desc: "Open a terminal and run:",
    code: "gamecodex setup",
  },
  {
    num: "3",
    title: "Paste your key",
    desc: "When prompted, paste the license key. You'll see \"Pro activated!\" and you're done.",
  },
];

export default function ProSuccessPage() {
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>&#x2713;</div>
          <h1 className="section-title" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)" }}>
            Welcome to <span className="hero-gradient-text">Pro</span>!
          </h1>
          <p className="section-sub" style={{ maxWidth: 500 }}>
            All 5 tools are now yours. Here's how to activate in 30 seconds.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="px-6 pb-16">
        <div className="max-w-2xl mx-auto" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {STEPS.map(({ num, title, desc, code }) => (
            <div key={num} style={{
              background: "var(--card-bg, rgba(255,255,255,0.04))",
              border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
              borderRadius: "12px",
              padding: "1.5rem 2rem",
              display: "flex",
              gap: "1.5rem",
              alignItems: "flex-start",
            }}>
              <div style={{
                background: "var(--accent, #6366f1)",
                color: "var(--white)",
                width: 36,
                height: 36,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {num}
              </div>
              <div>
                <h3 style={{ color: "var(--white)", fontWeight: 600, marginBottom: "0.4rem" }}>{title}</h3>
                <p style={{ color: "var(--smoke)", lineHeight: 1.6 }}>{desc}</p>
                {code && (
                  <pre style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    padding: "0.75rem 1rem",
                    marginTop: "0.75rem",
                    color: "#4ade80",
                    fontFamily: "monospace",
                    fontSize: "0.95rem",
                  }}>
                    $ {code}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Alternative */}
      <section className="px-6 pb-16">
        <div className="max-w-2xl mx-auto" style={{
          background: "var(--card-bg, rgba(255,255,255,0.04))",
          border: "1px solid var(--card-border, rgba(255,255,255,0.08))",
          borderRadius: "12px",
          padding: "1.5rem 2rem",
        }}>
          <h3 style={{ color: "var(--white)", fontWeight: 600, marginBottom: "0.5rem" }}>Prefer environment variables?</h3>
          <p style={{ color: "var(--smoke)", lineHeight: 1.6 }}>
            Add this to your shell profile (<code style={{ color: "var(--white)" }}>.zshrc</code>, <code style={{ color: "var(--white)" }}>.bashrc</code>, etc.):
          </p>
          <pre style={{
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            marginTop: "0.75rem",
            color: "#4ade80",
            fontFamily: "monospace",
            fontSize: "0.95rem",
          }}>
            export GAMECODEX_LICENSE=&quot;your-license-key-here&quot;
          </pre>
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
