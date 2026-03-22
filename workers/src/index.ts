/**
 * gamedev-mcp-api — Cloudflare Worker for Pro content delivery
 *
 * Serves game development docs with tier-gated access.
 * Pro content requires a valid LemonSqueezy license key.
 */

import type { Env } from "./types.js";
import { Router } from "./router.js";
import { corsPreflightResponse, errorResponse } from "./helpers.js";
import {
  handleHealth,
  handleListDocs,
  handleGetDoc,
  handleSearch,
  handleLicenseValidate,
} from "./handlers.js";
import { handleLemonSqueezyWebhook } from "./webhooks.js";

const router = new Router();

// Register routes
router.get("/v1/health", handleHealth as any);
router.get("/v1/docs", handleListDocs as any);
router.get("/v1/docs/:id", handleGetDoc as any);
router.get("/v1/search", handleSearch as any);
router.post("/v1/license/validate", handleLicenseValidate as any);
router.post("/v1/webhooks/lemonsqueezy", handleLemonSqueezyWebhook as any);

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return corsPreflightResponse();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route matching
    const match = router.match(request.method, pathname);
    if (match) {
      try {
        return await match.handler(request, match.params, env as any);
      } catch (err) {
        console.error("Handler error:", err);
        return errorResponse(
          `Internal server error: ${err instanceof Error ? err.message : String(err)}`,
          500
        );
      }
    }

    // Root redirect
    if (pathname === "/" || pathname === "") {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://sbenson2.github.io/gamedev-mcp-server/" },
      });
    }

    return errorResponse("Not found", 404);
  },
};
