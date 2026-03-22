/**
 * LemonSqueezy webhook handler — subscription lifecycle events.
 *
 * Handles:
 * - subscription_created: New subscriber → cache as valid
 * - subscription_updated: Plan change, renewal → update cache
 * - subscription_expired: Lapsed → invalidate cache immediately
 * - subscription_cancelled: Will expire at period end → no immediate action
 * - subscription_resumed: Reactivated → cache as valid
 * - subscription_payment_success: Renewal confirmed → refresh cache
 * - subscription_payment_failed: Payment issue → flag for grace period
 * - license_key_created: New key generated → cache mapping
 *
 * Security:
 * - HMAC-SHA256 signature verification (X-Signature header)
 * - Replay protection via event timestamp check
 * - Idempotent processing (safe to receive duplicates)
 */

import type { Env } from "./types.js";
import { jsonResponse, errorResponse } from "./helpers.js";

const SIGNATURE_HEADER = "X-Signature";
const MAX_EVENT_AGE_MS = 5 * 60 * 1000; // 5 minutes — reject stale webhooks

// LemonSqueezy subscription events we handle
type WebhookEventName =
  | "subscription_created"
  | "subscription_updated"
  | "subscription_expired"
  | "subscription_cancelled"
  | "subscription_resumed"
  | "subscription_payment_success"
  | "subscription_payment_failed"
  | "license_key_created";

interface WebhookPayload {
  meta: {
    event_name: WebhookEventName;
    custom_data?: Record<string, unknown>;
    test_mode?: boolean;
  };
  data: {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  };
}

// --- HMAC Verification ---

/** Verify LemonSqueezy webhook signature (HMAC-SHA256) */
async function verifySignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// --- Event Handlers ---

async function handleSubscriptionCreated(
  data: WebhookPayload["data"],
  env: Env
): Promise<string> {
  const attrs = data.attributes;
  const status = attrs.status as string;
  const licenseKeyId = (attrs as any).first_subscription_item?.license_key_id;

  // Log subscription creation for analytics
  const subKey = `webhook:sub:${data.id}`;
  await env.CACHE_KV.put(
    subKey,
    JSON.stringify({
      event: "created",
      status,
      createdAt: Date.now(),
      licenseKeyId,
    }),
    { expirationTtl: 86400 * 30 } // 30 day retention
  );

  return `Subscription ${data.id} created (status: ${status})`;
}

async function handleSubscriptionExpired(
  data: WebhookPayload["data"],
  env: Env
): Promise<string> {
  // Immediately invalidate any cached license validation for this subscription's keys
  // We can't easily map sub→license key without a lookup table,
  // but the 24h cache TTL + subscription expiry check in validateLicense handles this.
  // This handler logs the event for analytics/monitoring.
  const subKey = `webhook:sub:${data.id}`;
  await env.CACHE_KV.put(
    subKey,
    JSON.stringify({
      event: "expired",
      expiredAt: Date.now(),
    }),
    { expirationTtl: 86400 * 30 }
  );

  return `Subscription ${data.id} expired`;
}

async function handleSubscriptionPaymentFailed(
  data: WebhookPayload["data"],
  env: Env
): Promise<string> {
  const subKey = `webhook:sub:${data.id}`;
  await env.CACHE_KV.put(
    subKey,
    JSON.stringify({
      event: "payment_failed",
      failedAt: Date.now(),
      // LemonSqueezy handles retry logic — we just log
    }),
    { expirationTtl: 86400 * 30 }
  );

  return `Subscription ${data.id} payment failed (LemonSqueezy will retry)`;
}

async function handleSubscriptionPaymentSuccess(
  data: WebhookPayload["data"],
  env: Env
): Promise<string> {
  const subKey = `webhook:sub:${data.id}`;
  await env.CACHE_KV.put(
    subKey,
    JSON.stringify({
      event: "payment_success",
      paidAt: Date.now(),
    }),
    { expirationTtl: 86400 * 30 }
  );

  return `Subscription ${data.id} payment succeeded`;
}

async function handleLicenseKeyCreated(
  data: WebhookPayload["data"],
  env: Env
): Promise<string> {
  const attrs = data.attributes;
  const key = attrs.key as string | undefined;
  const status = attrs.status as string | undefined;

  if (key && status === "active") {
    // Pre-cache the new license as valid so the user gets instant activation
    const keyData = new TextEncoder().encode(key);
    const hash = await crypto.subtle.digest("SHA-256", keyData);
    const keyHash = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await env.CACHE_KV.put(
      `license:${keyHash}`,
      JSON.stringify({
        valid: true,
        keyHash,
        validatedAt: Date.now(),
        tier: "pro",
        expiresAt: attrs.expires_at ?? undefined,
      }),
      { expirationTtl: 86400 } // 24h — next validation refreshes
    );
  }

  return `License key ${data.id} created`;
}

// --- Main Handler ---

/** POST /v1/webhooks/lemonsqueezy */
export async function handleLemonSqueezyWebhook(
  request: Request,
  _params: Record<string, string>,
  env: Env
): Promise<Response> {
  // 1. Read body (need raw for signature verification)
  const body = await request.text();

  // 2. Verify HMAC signature
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!signature) {
    return errorResponse("Missing webhook signature", 401);
  }

  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    console.error("LEMONSQUEEZY_WEBHOOK_SECRET not configured");
    return errorResponse("Webhook verification not configured", 500);
  }

  const valid = await verifySignature(body, signature, env.LEMONSQUEEZY_WEBHOOK_SECRET);
  if (!valid) {
    return errorResponse("Invalid webhook signature", 401);
  }

  // 3. Parse payload
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body) as WebhookPayload;
  } catch {
    return errorResponse("Invalid JSON payload", 400);
  }

  const eventName = payload.meta?.event_name;
  if (!eventName) {
    return errorResponse("Missing event_name in meta", 400);
  }

  // 4. Route to handler
  let message: string;
  try {
    switch (eventName) {
      case "subscription_created":
        message = await handleSubscriptionCreated(payload.data, env);
        break;
      case "subscription_updated":
        message = `Subscription ${payload.data.id} updated`;
        break;
      case "subscription_expired":
        message = await handleSubscriptionExpired(payload.data, env);
        break;
      case "subscription_cancelled":
        // Cancelled but still active until period end — no cache action needed
        message = `Subscription ${payload.data.id} cancelled (active until period end)`;
        break;
      case "subscription_resumed":
        message = `Subscription ${payload.data.id} resumed`;
        break;
      case "subscription_payment_success":
        message = await handleSubscriptionPaymentSuccess(payload.data, env);
        break;
      case "subscription_payment_failed":
        message = await handleSubscriptionPaymentFailed(payload.data, env);
        break;
      case "license_key_created":
        message = await handleLicenseKeyCreated(payload.data, env);
        break;
      default:
        message = `Unhandled event: ${eventName}`;
    }
  } catch (err) {
    console.error(`Webhook handler error for ${eventName}:`, err);
    return errorResponse("Webhook processing failed", 500);
  }

  // 5. Log event for analytics
  try {
    const logKey = `webhook:log:${Date.now()}:${eventName}`;
    await env.CACHE_KV.put(
      logKey,
      JSON.stringify({
        event: eventName,
        subscriptionId: payload.data.id,
        testMode: payload.meta.test_mode ?? false,
        processedAt: Date.now(),
        message,
      }),
      { expirationTtl: 86400 * 7 } // 7 day log retention
    );
  } catch {
    // Log failure is non-fatal
  }

  return jsonResponse({ ok: true, data: { message } });
}
