'use client';

import { useState, useEffect } from 'react';
import { PROVIDERS, type ProviderKey } from '@/lib/providers';

interface SettingsState {
  provider: ProviderKey;
  model: string;
  apiKey: string;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: SettingsState;
  onSettingsChange: (settings: SettingsState) => void;
}

export default function SettingsPanel({ open, onClose, settings, onSettingsChange }: SettingsPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const currentProvider = PROVIDERS.find(p => p.key === settings.provider) ?? PROVIDERS[0];

  // Save to localStorage whenever settings change
  useEffect(() => {
    if (settings.apiKey) {
      localStorage.setItem('gamecodex-settings', JSON.stringify(settings));
    }
  }, [settings]);

  const handleProviderChange = (key: ProviderKey) => {
    const provider = PROVIDERS.find(p => p.key === key)!;
    onSettingsChange({
      ...settings,
      provider: key,
      model: provider.defaultModel,
      apiKey: '', // Clear key when switching provider
    });
    setShowKey(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'bg-black/60 backdrop-blur-sm' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-md transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="h-full flex flex-col" style={{ background: 'var(--anvil)', borderLeft: '1px solid var(--steel)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--steel)' }}>
            <div>
              <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--white)' }}>
                Configuration
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>Connect your AI provider</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: 'var(--ash)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Provider */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2.5" style={{ color: 'var(--ash)', fontFamily: 'var(--font-mono)' }}>
                Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDERS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => handleProviderChange(p.key)}
                    className="relative px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200"
                    style={{
                      background: settings.provider === p.key ? 'var(--forge-ember)' : 'var(--iron)',
                      border: `1px solid ${settings.provider === p.key ? 'rgba(0,255,136,0.3)' : 'var(--steel)'}`,
                      color: settings.provider === p.key ? 'var(--forge)' : 'var(--smoke)',
                    }}
                  >
                    {settings.provider === p.key && (
                      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--forge)' }} />
                    )}
                    <span className="block text-xs" style={{ fontFamily: 'var(--font-display)' }}>
                      {p.key === 'anthropic' ? 'Claude' : p.key === 'openai' ? 'OpenAI' : 'Gemini'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2.5" style={{ color: 'var(--ash)', fontFamily: 'var(--font-mono)' }}>
                Model
              </label>
              <div className="space-y-1.5">
                {currentProvider.models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onSettingsChange({ ...settings, model: m.id })}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 text-left"
                    style={{
                      background: settings.model === m.id ? 'var(--forge-ember)' : 'transparent',
                      border: `1px solid ${settings.model === m.id ? 'rgba(0,255,136,0.2)' : 'transparent'}`,
                      color: settings.model === m.id ? 'var(--white)' : 'var(--smoke)',
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: settings.model === m.id ? 'var(--forge)' : 'var(--silver)' }}
                    />
                    <span style={{ fontFamily: 'var(--font-display)' }}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-2.5" style={{ color: 'var(--ash)', fontFamily: 'var(--font-mono)' }}>
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={settings.apiKey}
                  onChange={e => onSettingsChange({ ...settings, apiKey: e.target.value })}
                  placeholder={`Enter your ${currentProvider.label} API key`}
                  className="w-full px-4 py-3 rounded-lg text-sm pr-12 transition-all duration-200 focus:outline-none"
                  style={{
                    background: 'var(--iron)',
                    border: '1px solid var(--steel)',
                    color: 'var(--bone)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.82rem',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(0,255,136,0.3)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(0,255,136,0.06)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'var(--steel)';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors"
                  style={{ color: 'var(--ash)' }}
                >
                  {showKey ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--ash)' }}>
                Stored locally in your browser. Never sent to our servers.
              </p>
            </div>

            {/* Status */}
            {settings.apiKey && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg animate-fade-in"
                style={{ background: 'var(--forge-ember)', border: '1px solid rgba(0,255,136,0.15)' }}
              >
                <div className="w-2 h-2 rounded-full animate-pulse-forge" style={{ background: 'var(--forge)' }} />
                <span className="text-sm" style={{ color: 'var(--forge)', fontFamily: 'var(--font-display)' }}>
                  Ready — {currentProvider.models.find(m => m.id === settings.model)?.label}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4" style={{ borderTop: '1px solid var(--steel)' }}>
            <button
              onClick={onClose}
              disabled={!settings.apiKey}
              className="w-full py-3 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: settings.apiKey ? 'var(--forge)' : 'var(--steel)',
                color: settings.apiKey ? 'var(--void)' : 'var(--ash)',
                fontFamily: 'var(--font-display)',
              }}
            >
              {settings.apiKey ? 'Start Forging' : 'Enter API Key to Continue'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export type { SettingsState };
