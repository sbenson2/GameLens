import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Config, DEFAULT_MODELS } from "../config.js";

export type ProviderId = "anthropic" | "openai" | "google" | "ollama";

export interface Provider {
  id: ProviderId;
  name: string;
  createModel(modelId?: string): any;
}

export class ProviderManager {
  private providers: Map<ProviderId, Provider> = new Map();
  private defaultProvider: ProviderId;
  private defaultModel: string | undefined;

  constructor(config: Config) {
    this.defaultProvider = config.tui.defaultProvider;
    this.defaultModel = config.tui.defaultModel;

    if (config.providers.ollama) {
      this.registerOllama(config.providers.ollama);
    }
    if (config.providers.anthropic) {
      this.registerAnthropic(config.providers.anthropic);
    }
    if (config.providers.openai) {
      this.registerOpenAI(config.providers.openai);
    }
    if (config.providers.google) {
      this.registerGoogle(config.providers.google);
    }
  }

  private registerOllama(config: NonNullable<Config["providers"]["ollama"]>): void {
    const provider = createOpenAICompatible({
      name: "ollama",
      baseURL: config.baseURL,
    });
    this.providers.set("ollama", {
      id: "ollama",
      name: "Ollama (Local)",
      createModel: (modelId?: string) => provider(modelId || config.defaultModel || "llama3.2"),
    });
  }

  private registerAnthropic(config: NonNullable<Config["providers"]["anthropic"]>): void {
    const anthropic = createAnthropic({
      apiKey: config.apiKey,
    });
    this.providers.set("anthropic", {
      id: "anthropic",
      name: "Anthropic (Claude)",
      createModel: (modelId?: string) => anthropic(modelId || config.defaultModel || DEFAULT_MODELS.anthropic),
    });
  }

  private registerOpenAI(config: NonNullable<Config["providers"]["openai"]>): void {
    const openai = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.providers.set("openai", {
      id: "openai",
      name: "OpenAI",
      createModel: (modelId?: string) => openai(modelId || config.defaultModel || DEFAULT_MODELS.openai),
    });
  }

  private registerGoogle(config: NonNullable<Config["providers"]["google"]>): void {
    const google = createGoogleGenerativeAI({
      apiKey: config.apiKey,
    });
    this.providers.set("google", {
      id: "google",
      name: "Google (Gemini)",
      createModel: (modelId?: string) => google(modelId || config.defaultModel || DEFAULT_MODELS.google),
    });
  }

  getModel(providerId?: ProviderId): any {
    const id = providerId || this.defaultProvider;
    const provider = this.providers.get(id);

    if (!provider) {
      throw new Error(`Provider ${id} not configured. Available: ${this.availableProviders.join(", ") || "none"}`);
    }

    const modelId = providerId ? undefined : this.defaultModel;
    return provider.createModel(modelId);
  }

  getAvailableProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  get availableProviders(): ProviderId[] {
    return Array.from(this.providers.keys());
  }

  getDefaultProvider(): ProviderId {
    return this.defaultProvider;
  }

  isProviderAvailable(id: ProviderId): boolean {
    return this.providers.has(id);
  }
}
