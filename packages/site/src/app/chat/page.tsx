'use client';

import { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import ChatMessage from '@/components/ChatMessage';
import SettingsPanel, { type SettingsState } from '@/components/SettingsPanel';
import { PROVIDERS, type ProviderKey } from '@/lib/providers';

const WELCOME_SUGGESTIONS = [
  { text: 'Build a roguelike in Godot', icon: '⚔️' },
  { text: 'Platformer with wall jumps in Pygame', icon: '🏃' },
  { text: 'How do I make a camera follow system?', icon: '📷' },
  { text: 'Top-down RPG architecture in MonoGame', icon: '🗺️' },
  { text: 'Add screen shake and game feel', icon: '💥' },
  { text: 'Procedural dungeon generation explained', icon: '🏰' },
];

export default function ChatPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    provider: 'anthropic' as ProviderKey,
    model: 'claude-sonnet-4-6',
    apiKey: '',
  });
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('gamecodex-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(parsed);
      } catch {
        // ignore
      }
    } else {
      // No settings, show panel
      setSettingsOpen(true);
    }
  }, []);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: {
        provider: settings.provider,
        model: settings.model,
        apiKey: settings.apiKey,
      },
    }),
  });

  const isStreaming = status === 'streaming';
  const isReady = status === 'ready';
  const hasMessages = messages.length > 0;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    if (isReady) inputRef.current?.focus();
  }, [isReady]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !isReady) return;
    if (!settings.apiKey) {
      setSettingsOpen(true);
      return;
    }
    sendMessage({ text });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const handleSuggestion = (text: string) => {
    if (!settings.apiKey) {
      setSettingsOpen(true);
      return;
    }
    sendMessage({ text });
  };

  const currentProvider = PROVIDERS.find(p => p.key === settings.provider);
  const currentModel = currentProvider?.models.find(m => m.id === settings.model);

  return (
    <div className="h-dvh flex flex-col noise-overlay scanlines">
      {/* ═══ Header ═══ */}
      <header
        className="shrink-0 flex items-center justify-between px-5 py-3"
        style={{ background: 'var(--anvil)', borderBottom: '1px solid var(--steel)' }}
      >
        <div className="flex items-center gap-3">
          {/* Logo */}
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

          {/* Connection status pill */}
          {settings.apiKey && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
              style={{ background: 'var(--forge-ember)', border: '1px solid rgba(0,255,136,0.15)', fontFamily: 'var(--font-mono)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--forge)' }} />
              <span style={{ color: 'var(--forge-dim)' }}>{currentModel?.label?.split(' (')[0] ?? settings.model}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {hasMessages && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: 'var(--smoke)', fontFamily: 'var(--font-display)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--smoke)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        </div>
      </header>

      {/* ═══ Messages ═══ */}
      <main className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          /* Welcome state */
          <div className="h-full flex flex-col items-center justify-center px-6">
            <div className="max-w-lg w-full text-center">
              {/* Hero */}
              <div
                className="w-14 h-14 rounded-xl mx-auto mb-5 flex items-center justify-center text-xl font-black animate-glow-breathe"
                style={{ background: 'var(--forge)', color: 'var(--void)', fontFamily: 'var(--font-display)' }}
              >
                G
              </div>
              <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}>
                What are you building?
              </h1>
              <p className="text-sm mb-8" style={{ color: 'var(--ash)' }}>
                Any engine. Any language. From concept to code.
              </p>

              {/* Suggestion chips */}
              <div className="grid grid-cols-2 gap-2 text-left">
                {WELCOME_SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestion(s.text)}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm transition-all duration-200 hover:translate-y-[-1px]"
                    style={{
                      background: 'var(--iron)',
                      border: '1px solid var(--steel)',
                      color: 'var(--smoke)',
                      fontFamily: 'var(--font-display)',
                      animationDelay: `${i * 0.05}s`,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(0,255,136,0.2)';
                      e.currentTarget.style.background = 'var(--steel)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--steel)';
                      e.currentTarget.style.background = 'var(--iron)';
                    }}
                  >
                    <span className="text-base">{s.icon}</span>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>

              {!settings.apiKey && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="mt-6 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
                  style={{ background: 'var(--forge)', color: 'var(--void)', fontFamily: 'var(--font-display)' }}
                >
                  Connect AI Provider →
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Chat messages */
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {messages.map(message => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {/* Streaming indicator */}
            {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <div className="flex items-center gap-2 pl-1 animate-fade-in">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
                  style={{ background: 'var(--forge)', color: 'var(--void)' }}
                >
                  G
                </div>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--forge)' }} />
                  <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--forge)' }} />
                  <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--forge)' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* ═══ Input ═══ */}
      <footer className="shrink-0 px-4 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          <div
            className="relative rounded-xl transition-all duration-200"
            style={{ background: 'var(--iron)', border: '1px solid var(--steel)' }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={settings.apiKey ? 'Describe your game or ask anything...' : 'Connect an AI provider to start...'}
              disabled={!settings.apiKey}
              rows={1}
              className="w-full resize-none bg-transparent px-4 py-3.5 pr-24 text-sm focus:outline-none disabled:opacity-40 placeholder:text-[var(--silver)]"
              style={{
                color: 'var(--white)',
                fontFamily: 'var(--font-display)',
                minHeight: '48px',
                maxHeight: '160px',
              }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 160) + 'px';
              }}
              onFocus={e => {
                e.currentTarget.parentElement!.style.borderColor = 'rgba(0,255,136,0.25)';
              }}
              onBlur={e => {
                e.currentTarget.parentElement!.style.borderColor = 'var(--steel)';
              }}
            />

            <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
              {isStreaming ? (
                <button
                  onClick={stop}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: 'var(--danger)', color: 'white', fontFamily: 'var(--font-display)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !settings.apiKey}
                  className="p-2 rounded-lg transition-all duration-200 disabled:opacity-20"
                  style={{
                    background: input.trim() && settings.apiKey ? 'var(--forge)' : 'var(--steel)',
                    color: input.trim() && settings.apiKey ? 'var(--void)' : 'var(--ash)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <p className="text-center mt-2 text-xs" style={{ color: 'var(--silver)' }}>
            GameCodex uses your API key directly. Your data stays between you and your AI provider.
          </p>
        </div>
      </footer>

      {/* ═══ Settings Panel ═══ */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}
