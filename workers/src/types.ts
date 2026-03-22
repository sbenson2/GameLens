/** Cloudflare Worker environment bindings */
export interface Env {
  DOCS_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  API_VERSION: string;
  LEMONSQUEEZY_STORE_ID: string;
  LEMONSQUEEZY_WEBHOOK_SECRET: string;  // HMAC signing secret for webhook verification
}

/** Doc metadata stored in KV (value = content, metadata = this) */
export interface DocMeta {
  id: string;
  title: string;
  description: string;
  category: string;
  module: string;
  tier: "free" | "pro";
  sizeBytes: number;
  sections: string[];
}

/** License validation cache entry in CACHE_KV */
export interface LicenseCacheEntry {
  valid: boolean;
  keyHash: string;              // SHA-256 hash — never store plaintext key
  validatedAt: number;          // epoch ms
  tier: "free" | "pro";
  expiresAt?: string;           // ISO date for subscription expiry
  activationLimit?: number;     // from LemonSqueezy (undefined = unlimited)
  activationsUsed?: number;
}

/** Rate limit entry in CACHE_KV */
export interface RateLimitEntry {
  count: number;
  windowStart: number; // epoch ms
}

/** Search index entry stored in DOCS_KV under key "index:search" */
export interface SearchIndexEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  module: string;
  tier: "free" | "pro";
  tokens: string[]; // pre-tokenized for search
}

/** Standard API response envelope */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Parsed request context passed to handlers */
export interface RequestContext {
  env: Env;
  tier: "free" | "pro";
  licenseKey: string | null;
  clientIp: string;
}
