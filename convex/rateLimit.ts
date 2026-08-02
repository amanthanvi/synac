import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { requireServiceKey } from "./lib/serviceKey";

const limiter = new RateLimiter(components.rateLimiter, {
  api_v1_search: { kind: "fixed window", rate: 60, period: MINUTE },
  api_v1_view: { kind: "fixed window", rate: 120, period: MINUTE },
});

/**
 * Consumes one token from the per-session bucket for an API scope. Guarded by
 * the service key: only the Next.js server can spend (or probe) budgets, so
 * the limiter state cannot be manipulated from the open internet.
 */
export const consume = mutation({
  args: {
    serviceKey: v.string(),
    scope: v.union(v.literal("api_v1_search"), v.literal("api_v1_view")),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceKey(args.serviceKey);
    const status = await limiter.limit(ctx, args.scope, { key: args.key });
    return {
      allowed: status.ok,
      retryAfterSeconds: status.ok ? 0 : Math.max(1, Math.ceil((status.retryAfter ?? 1000) / 1000)),
    };
  },
});
