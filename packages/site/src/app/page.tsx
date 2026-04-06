import Link from 'next/link';

const ENGINES = ['Godot', 'MonoGame', 'Unity', 'Pygame', 'Phaser', 'Love2D', 'Bevy', 'GameMaker'];
const FEATURES = [
  { icon: '🎮', title: 'Any Engine', desc: 'Godot, Unity, MonoGame, Pygame, Phaser, and more' },
  { icon: '🧠', title: 'Deep Knowledge', desc: '150+ curated guides on game systems and architecture' },
  { icon: '🔧', title: 'Your AI, Your Key', desc: 'Bring Claude, GPT, or Gemini. We never see your data.' },
  { icon: '⚡', title: 'Concept to Code', desc: 'Describe your game. Get code that runs.' },
];

export default function Home() {
  return (
    <div className="min-h-dvh noise-overlay scanlines flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-sm animate-glow-breathe"
            style={{ background: 'var(--forge)', color: 'var(--void)', fontFamily: 'var(--font-display)' }}
          >
            G
          </div>
          <span className="text-base font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}>
            Game<span style={{ color: 'var(--forge)' }}>Forge</span>
          </span>
        </div>
        <Link
          href="/chat"
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:brightness-110"
          style={{ background: 'var(--forge)', color: 'var(--void)', fontFamily: 'var(--font-display)' }}
        >
          Start Building
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-8"
            style={{ background: 'var(--forge-ember)', border: '1px solid rgba(0,255,136,0.15)', color: 'var(--forge)', fontFamily: 'var(--font-mono)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full animate-pulse-forge" style={{ background: 'var(--forge)' }} />
            Powered by your choice of AI
          </div>

          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.1] mb-5"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}
          >
            Your AI forgets<br />
            <span style={{ color: 'var(--forge)' }} className="forge-glow-text">game dev</span> mid-project.
            <br />
            <span style={{ color: 'var(--ash)', fontWeight: 500, fontSize: '0.65em' }}>
              This one doesn&apos;t.
            </span>
          </h1>

          <p className="text-lg mb-10 max-w-md mx-auto" style={{ color: 'var(--smoke)', fontFamily: 'var(--font-display)' }}>
            150+ curated guides. Any engine. Any language.
            <br />Describe your game. Get code that runs.
          </p>

          <Link
            href="/chat"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-bold transition-all duration-200 hover:brightness-110 hover:translate-y-[-1px] forge-glow"
            style={{ background: 'var(--forge)', color: 'var(--void)', fontFamily: 'var(--font-display)' }}
          >
            Start Building
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>

          {/* Engine ticker */}
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            {ENGINES.map(e => (
              <span
                key={e}
                className="px-3 py-1 rounded-md text-xs"
                style={{ background: 'var(--iron)', border: '1px solid var(--steel)', color: 'var(--ash)', fontFamily: 'var(--font-mono)' }}
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="px-4 py-4 rounded-xl"
              style={{ background: 'var(--iron)', border: '1px solid var(--steel)' }}
            >
              <div className="text-xl mb-2">{f.icon}</div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--white)', fontFamily: 'var(--font-display)' }}>
                {f.title}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ash)' }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
