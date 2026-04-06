'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from 'ai';

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  genre_lookup: { label: 'Analyzing genre', icon: '🎮' },
  search_knowledge: { label: 'Searching knowledge base', icon: '🔍' },
  get_knowledge: { label: 'Reading article', icon: '📖' },
  plan_architecture: { label: 'Planning architecture', icon: '🏗️' },
};

function isToolPart(part: { type: string }): part is {
  type: string;
  toolName: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  args?: Record<string, unknown>;
} {
  return part.type.startsWith('tool-') || part.type === 'dynamic-tool';
}

function getToolName(part: { type: string; toolName?: string }): string {
  if ('toolName' in part && part.toolName) return part.toolName;
  if (part.type.startsWith('tool-')) return part.type.slice(5);
  return 'unknown';
}

export default function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`animate-fade-in ${isUser ? 'flex justify-end' : ''}`}
      style={{ animationDelay: '0.05s' }}
    >
      <div
        className={`max-w-[85%] ${isUser ? 'ml-auto' : ''}`}
      >
        {/* Role indicator */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--forge)', color: 'var(--void)' }}
            >
              G
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--ash)', fontFamily: 'var(--font-mono)' }}>
              GameCodex
            </span>
          </div>
        )}

        <div
          className={`rounded-xl px-4 py-3 ${isUser ? 'rounded-br-sm' : 'rounded-tl-sm'}`}
          style={{
            background: isUser ? 'var(--steel)' : 'var(--iron)',
            border: `1px solid ${isUser ? 'var(--silver)' : 'var(--steel)'}`,
          }}
        >
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              if (isUser) {
                return (
                  <p key={index} className="text-sm leading-relaxed" style={{ color: 'var(--white)' }}>
                    {part.text}
                  </p>
                );
              }
              return (
                <div key={index} className="markdown-body text-sm" style={{ color: 'var(--bone)' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.text}
                  </ReactMarkdown>
                </div>
              );
            }

            if (isToolPart(part)) {
              const toolName = getToolName(part);
              const args = ('input' in part ? part.input : 'args' in part ? part.args : {}) as Record<string, unknown>;
              const result = 'output' in part ? part.output : undefined;
              const state = ('state' in part ? part.state : 'call') as string;
              return (
                <ToolCard
                  key={index}
                  toolName={toolName}
                  args={args ?? {}}
                  state={state}
                  result={result}
                />
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
}

function ToolCard({
  toolName,
  args,
  state,
  result,
}: {
  toolName: string;
  args: Record<string, unknown> | unknown;
  state: string;
  result?: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const toolInfo = TOOL_LABELS[toolName] ?? { label: toolName, icon: '⚙️' };
  const isLoading = state === 'call' || state === 'partial-call';

  return (
    <div
      className="my-2 rounded-lg overflow-hidden transition-all duration-200"
      style={{ background: 'var(--abyss)', border: '1px solid var(--steel)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.02]"
      >
        {isLoading ? (
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--forge)' }} />
            <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--forge)' }} />
            <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: 'var(--forge)' }} />
          </div>
        ) : (
          <span className="text-sm">{toolInfo.icon}</span>
        )}
        <span className="text-xs font-medium flex-1" style={{ color: isLoading ? 'var(--forge)' : 'var(--ash)', fontFamily: 'var(--font-mono)' }}>
          {isLoading ? `${toolInfo.label}...` : toolInfo.label}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          style={{ color: 'var(--silver)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded ? (
        <div className="px-3 pb-2.5 animate-fade-in" style={{ borderTop: '1px solid var(--steel)' }}>
          <div className="mt-2">
            <span className="text-xs" style={{ color: 'var(--ash)', fontFamily: 'var(--font-mono)' }}>Input:</span>
            <pre className="mt-1 text-xs p-2 rounded overflow-x-auto" style={{ background: 'var(--void)', color: 'var(--smoke)', fontFamily: 'var(--font-mono)' }}>
              {JSON.stringify(args ?? {}, null, 2)}
            </pre>
          </div>
          {result != null ? (
            <div className="mt-2">
              <span className="text-xs" style={{ color: 'var(--ash)', fontFamily: 'var(--font-mono)' }}>Output:</span>
              <pre className="mt-1 text-xs p-2 rounded overflow-x-auto max-h-48" style={{ background: 'var(--void)', color: 'var(--smoke)', fontFamily: 'var(--font-mono)' }}>
                {String(typeof result === 'string' ? result.slice(0, 1000) : JSON.stringify(result, null, 2).slice(0, 1000))}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
