import fs from "fs";
import path from "path";
import { Config, ConfigSchema, getConfigPath, resolveEnvVar } from "./config.js";

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    cachedConfig = ConfigSchema.parse({});
    return cachedConfig;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const resolved = resolveConfigEnvVars(raw);
    cachedConfig = ConfigSchema.parse(resolved);
    return cachedConfig;
  } catch (error) {
    console.error(`Failed to parse config at ${configPath}:`, error);
    cachedConfig = ConfigSchema.parse({});
    return cachedConfig;
  }
}

function resolveConfigEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return resolveEnvVar(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveConfigEnvVars);
  }
  if (obj && typeof obj === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveConfigEnvVars(value);
    }
    return resolved;
  }
  return obj;
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function resetConfig(): void {
  cachedConfig = null;
}
