import { z } from "zod";

export const ProviderConfigSchema = z.object({
  ollama: z.object({
    baseURL: z.string().default("http://localhost:11434/v1"),
    defaultModel: z.string().optional(),
  }).optional(),
  anthropic: z.object({
    apiKey: z.string(),
    defaultModel: z.string().optional(),
  }).optional(),
  openai: z.object({
    apiKey: z.string(),
    baseURL: z.string().optional(),
    defaultModel: z.string().optional(),
  }).optional(),
  google: z.object({
    apiKey: z.string(),
    defaultModel: z.string().optional(),
  }).optional(),
});

export const TUIConfigSchema = z.object({
  defaultProvider: z.enum(["ollama", "anthropic", "openai", "google"]).default("anthropic"),
  defaultModel: z.string().optional(),
  showToolCalls: z.boolean().default(true),
  autoRecover: z.boolean().default(true),
  maxIterations: z.number().default(50),
  serverPath: z.string().optional(),
});

export const ConfigSchema = z.object({
  tui: TUIConfigSchema.default({}),
  providers: ProviderConfigSchema.default({}),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type TUIConfig = z.infer<typeof TUIConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  ollama: "llama3.2",
};

export function getConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  return `${home}/.gamecodex/config.json`;
}

export function resolveEnvVar(value: string): string {
  if (value.startsWith("env:") && value.length > 4) {
    const envKey = value.slice(4);
    return process.env[envKey] || "";
  }
  return value;
}
