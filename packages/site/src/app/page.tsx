'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

/* ─── Data ─── */
const ENGINES = [
  { name: 'Godot', icon: '◈' },
  { name: 'Unity', icon: '▣' },
  { name: 'Unreal', icon: '◎' },
  { name: 'MonoGame', icon: '◆' },
  { name: 'Bevy', icon: '⬡' },
  { name: 'Phaser', icon: '◇' },
  { name: 'GameMaker', icon: '✦' },
  { name: 'Pygame', icon: '◉' },
  { name: 'Love2D', icon: '♥' },
  { name: 'Raylib', icon: '▲' },
  { name: 'Defold', icon: '◇' },
  { name: 'Construct', icon: '▧' },
];

const STATS = [
  { value: '950+', label: 'Curated Guides' },
  { value: '5', label: 'Power Tools' },
  { value: '29', label: 'Engines' },
  { value: '0', label: 'Data Collected' },
];

const BENTO_FEATURES = [
  {
    title: 'Any Engine. One Brain.',
    desc: 'Godot, Unity, MonoGame, Phaser, Pygame — GameCodex speaks them all fluently. Switch engines mid-conversation without losing context.',
    span: 'col-span-2',
    accent: true,
  },
  {
    title: 'Your AI, Your Rules',
    desc: 'Works with Claude, GPT, or Gemini through your own MCP client. Your keys never leave your machine.',
    span: 'col-span-1',
  },
  {
    title: 'Debug Like a Mentor',
    desc: 'Paste an error, get a diagnosis. Not a generic Stack Overflow link — a real explanation of what went wrong and how to fix it.',
    span: 'col-span-1',
  },
  {
    title: 'From Concept to Running Code',
    desc: 'Describe your game in plain English. Get architecture, scaffolding, and starter code that actually compiles. Every snippet includes comments explaining why.',
    span: 'col-span-2',
  },
  {
    title: '950+ Deep Guides',
    desc: 'Not blog posts — structured knowledge on ECS, physics, pathfinding, shaders, state machines, and hundreds more game systems across 29 engines.',
    span: 'col-span-1',
  },
  {
    title: 'Scope Guardian',
    desc: 'Built-in scope creep detection and project health tracking. Knows when to say "cut this" before your game becomes vaporware.',
    span: 'col-span-1',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Install',
    desc: 'One command. Works with Claude Code, Cursor, Windsurf, or any MCP-compatible client.',
    code: 'npx gamecodex setup',
  },
  {
    num: '02',
    title: 'Connect',
    desc: 'Bring your own AI model. Claude, GPT, Gemini — your choice, your key, your privacy.',
    code: 'Provider: Claude Sonnet 4.6',
  },
  {
    num: '03',
    title: 'Build',
    desc: 'Ask anything about game dev. Get grounded answers from 950+ curated docs — not hallucinations.',
    code: '> scaffold a roguelike in Godot',
  },
];

const TERMINAL_LINES = [
  { type: 'prompt', text: '> How do I add ECS to my MonoGame project?' },
  { type: 'response', text: 'I\'ll search the knowledge base for ECS integration with MonoGame...' },
  { type: 'tool', text: '⚡ docs.search("monogame ECS architecture") → 12 results' },
  { type: 'response', text: 'Here\'s a complete ECS setup using Arch with MonoGame:' },
  { type: 'code', text: '// Create the world and register systems\nvar world = World.Create();\nworld.Create(new Position(0, 0), new Velocity(1, 0));\n\n// Query entities with specific components\nworld.Query(in (ref Position pos, ref Velocity vel) => {\n    pos.X += vel.X * deltaTime;\n    pos.Y += vel.Y * deltaTime;\n});' },
  { type: 'response', text: 'This uses Arch\'s source-generated queries for zero-allocation iteration. The `in` keyword marks read-only access, enabling safe parallelism.' },
];

/* ─── Scroll Reveal Hook ─── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed');
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`reveal-on-scroll ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ─── Page ─── */
export default function Home() {
  return (
    <div className="relative min-h-dvh noise-overlay scanlines">
      {/* Ambient gradient blobs */}
      <div className="ambient-glow ambient-glow-1" />
      <div className="ambient-glow ambient-glow-2" />
      <div className="ambient-glow ambient-glow-3" />

      {/* ═══ NAV ═══ */}
      <nav className="glass-nav">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="logo-mark">G</div>
            <span className="text-base font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}>
              Game<span style={{ color: 'var(--forge)' }}>Codex</span>
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/sbenson2/GameCodex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm transition-colors duration-200 hidden sm:block"
              style={{ color: 'var(--ash)', fontFamily: 'var(--font-display)' }}
            >
              GitLab
            </a>
            <a
              href="https://www.npmjs.com/package/gamecodex"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-cta"
            >
              Get Started
            </a>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          {/* Badge */}
          <Reveal>
            <div className="hero-badge">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse-forge" style={{ background: 'var(--forge)' }} />
              MCP Server · CLI Tool · Web App
            </div>
          </Reveal>

          {/* Headline */}
          <Reveal delay={100}>
            <h1 className="hero-headline">
              Your AI forgets<br />
              <span className="hero-gradient-text">game dev</span> mid-project.
            </h1>
          </Reveal>

          <Reveal delay={200}>
            <p className="hero-sub">
              GameCodex gives any AI instant access to 950+ curated game development guides.
              <br className="hidden sm:block" />
              Any engine. Any language. Zero hallucinations.
            </p>
          </Reveal>

          {/* CTAs */}
          <Reveal delay={300}>
            <div className="flex flex-col sm:flex-row items-center gap-4 mt-10">
              <a
                href="https://www.npmjs.com/package/gamecodex"
                target="_blank"
                rel="noopener noreferrer"
                className="hero-cta-primary"
              >
                Get Started
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
              <div className="hero-cta-secondary" style={{ cursor: 'default' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>npx gamecodex setup</span>
              </div>
            </div>
          </Reveal>

          {/* Engine pills */}
          <Reveal delay={400}>
            <div className="flex items-center justify-center gap-2 mt-12 flex-wrap">
              {ENGINES.map((e, i) => (
                <span key={e.name} className="engine-pill" style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="engine-pill-icon">{e.icon}</span>
                  {e.name}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ STATS BAR ═══ */}
      <section className="relative py-12 border-y" style={{ borderColor: 'var(--steel)' }}>
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
              {STATS.map((s, i) => (
                <div key={i} className="text-center">
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ BENTO FEATURES ═══ */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <h2 className="section-title">Everything your AI is missing</h2>
              <p className="section-sub">
                GameCodex plugs directly into your AI workflow — no context window wasted, no outdated training data.
              </p>
            </div>
          </Reveal>

          <div className="bento-grid">
            {BENTO_FEATURES.map((f, i) => (
              <Reveal key={i} delay={i * 80} className={f.span}>
                <div className={`bento-card ${f.accent ? 'bento-card-accent' : ''}`}>
                  <h3 className="bento-title">{f.title}</h3>
                  <p className="bento-desc">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="py-24 px-6" style={{ background: 'var(--abyss)' }}>
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <h2 className="section-title">Three steps. That&apos;s it.</h2>
              <p className="section-sub">From install to building your game in under two minutes.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <Reveal key={i} delay={i * 120}>
                <div className="step-card">
                  <div className="step-num">{s.num}</div>
                  <h3 className="step-title">{s.title}</h3>
                  <p className="step-desc">{s.desc}</p>
                  <div className="step-code">{s.code}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TERMINAL DEMO ═══ */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="section-title">See it in action</h2>
              <p className="section-sub">Real answers grounded in real documentation — not training data guesses.</p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="terminal-window">
              <div className="terminal-header">
                <div className="terminal-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <span className="terminal-title">GameCodex</span>
                <div style={{ width: 52 }} />
              </div>
              <div className="terminal-body">
                {TERMINAL_LINES.map((line, i) => (
                  <div key={i} className={`terminal-line terminal-${line.type}`} style={{ animationDelay: `${i * 150}ms` }}>
                    {line.type === 'code' ? (
                      <pre className="terminal-code-block">{line.text}</pre>
                    ) : (
                      <span>{line.text}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ ENGINES ═══ */}
      <section className="py-24 px-6" style={{ background: 'var(--abyss)' }}>
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <h2 className="section-title">Your engine. Our knowledge.</h2>
              <p className="section-sub">Deep, structured documentation for every major game engine — not surface-level blog posts.</p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {ENGINES.map((e, i) => (
                <div key={e.name} className="engine-card" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className="engine-card-icon">{e.icon}</span>
                  <span className="engine-card-name">{e.name}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <h2 className="section-title">Full knowledge base. Free forever.</h2>
              <p className="section-sub">
                950+ docs across all 29 engines, no restrictions. Pro unlocks workflow tools that turn knowledge into shipped games.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Free tier */}
            <Reveal>
              <div className="pricing-card">
                <div className="pricing-tier">Free</div>
                <div className="pricing-price">$0<span className="pricing-period">/forever</span></div>
                <p className="pricing-desc">Full access to the entire knowledge base. No account, no credit card, no limits.</p>
                <ul className="pricing-features">
                  <li className="pricing-feature pricing-included">950+ curated game dev docs</li>
                  <li className="pricing-feature pricing-included">All 29 engine modules</li>
                  <li className="pricing-feature pricing-included">Search, browse, and read any doc</li>
                  <li className="pricing-feature pricing-included">Server diagnostics and status</li>
                  <li className="pricing-feature pricing-excluded">Project management and goals</li>
                  <li className="pricing-feature pricing-excluded">GDD, phases, and marketing</li>
                  <li className="pricing-feature pricing-excluded">Code scaffolding and debug</li>
                </ul>
                <a
                  href="https://www.npmjs.com/package/gamecodex"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pricing-cta-free"
                >
                  Install Free
                </a>
              </div>
            </Reveal>

            {/* Pro tier */}
            <Reveal delay={120}>
              <div className="pricing-card pricing-card-pro">
                <div className="pricing-badge">Most Popular</div>
                <div className="pricing-tier">Pro</div>
                <div className="pricing-price">$5<span className="pricing-period">/month</span></div>
                <p className="pricing-desc">Everything in Free, plus the tools that turn knowledge into running games.</p>
                <ul className="pricing-features">
                  <li className="pricing-feature pricing-included">Everything in Free</li>
                  <li className="pricing-feature pricing-included">Project goals, decisions, scope health</li>
                  <li className="pricing-feature pricing-included">GDD generation, phase checklists</li>
                  <li className="pricing-feature pricing-included">Marketing, store pages, launch prep</li>
                  <li className="pricing-feature pricing-included">Code scaffolding and starter code</li>
                  <li className="pricing-feature pricing-included">Debug diagnosis and architecture review</li>
                  <li className="pricing-feature pricing-included">Session workflow orchestration</li>
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
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="cta-glow" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <Reveal>
            <h2 className="cta-headline">
              Stop debugging your AI.<br />
              <span className="hero-gradient-text">Start building your game.</span>
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="section-sub mb-10">
              Full knowledge base, free forever. No credit card. No account.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://www.npmjs.com/package/gamecodex"
                target="_blank"
                rel="noopener noreferrer"
                className="hero-cta-primary"
              >
                Install GameCodex
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="https://github.com/sbenson2/GameCodex"
                target="_blank"
                rel="noopener noreferrer"
                className="hero-cta-secondary"
              >
                View Source
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t px-6 py-10" style={{ borderColor: 'var(--steel)' }}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="logo-mark" style={{ width: 22, height: 22, fontSize: '0.7rem' }}>G</div>
            <span className="text-sm" style={{ color: 'var(--ash)', fontFamily: 'var(--font-display)' }}>
              GameCodex — AI Game Dev Assistant
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm" style={{ color: 'var(--silver)' }}>
            <a href="https://github.com/sbenson2/GameCodex" target="_blank" rel="noopener noreferrer" className="footer-link">GitLab</a>
            <a href="https://www.npmjs.com/package/gamecodex" target="_blank" rel="noopener noreferrer" className="footer-link">npm</a>
            <a href="https://www.npmjs.com/package/gamecodex" target="_blank" rel="noopener noreferrer" className="footer-link">Install</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
