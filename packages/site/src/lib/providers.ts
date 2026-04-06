import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type ProviderKey = "anthropic" | "openai" | "google";

export interface ProviderConfig {
  key: ProviderKey;
  label: string;
  models: { id: string; label: string }[];
  defaultModel: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    key: "anthropic",
    label: "Claude (Anthropic)",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Recommended)" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fast)" },
    ],
    defaultModel: "claude-sonnet-4-6",
  },
  {
    key: "openai",
    label: "OpenAI",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini (Fast)" },
      { id: "o3-mini", label: "o3-mini (Reasoning)" },
    ],
    defaultModel: "gpt-4o",
  },
  {
    key: "google",
    label: "Google Gemini",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Fast)" },
    ],
    defaultModel: "gemini-2.5-flash",
  },
];

export function getModel(
  provider: ProviderKey,
  modelId: string,
  apiKey: string
): LanguageModel {
  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
  }
}
