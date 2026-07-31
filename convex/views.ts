import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireServiceKey } from "./lib/serviceKey";

const DEDUPE_WINDOW_MS = 30 * 60 * 1000;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const GC_BATCH = 500;

/**
 * Records an anonymous entry view, deduplicated per session within a 30-minute
 * window. Called only by the Next.js server (service key), with all timestamps
 * computed here so callers cannot forge view history.
 */
export const trackView = mutation({
  args: {
    serviceKey: v.string(),
    entryKey: v.string(),
    sessionHash: v.string(),
  },
  handler: async (ctx, args) => {
    requireServiceKey(args.serviceKey);
    if (!args.entryKey || args.sessionHash.length < 16) return { counted: false };
    const entry = await ctx.db
      .query("entries")
      .withIndex("by_key", (q) => q.eq("key", args.entryKey))
      .unique();
    if (!entry) return { counted: false };

    const now = Date.now();
    const existing = await ctx.db
      .query("entryViews")
      .withIndex("by_entryKey_and_sessionHash", (q) =>
        q.eq("entryKey", args.entryKey).eq("sessionHash", args.sessionHash),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("entryViews", {
        entryKey: args.entryKey,
        sessionHash: args.sessionHash,
        firstSeenAt: now,
        lastSeenAt: now,
        viewCount: 1,
      });
      return { counted: true };
    }
    if (now - existing.lastSeenAt < DEDUPE_WINDOW_MS) {
      await ctx.db.patch(existing._id, { lastSeenAt: now });
      return { counted: false };
    }
    await ctx.db.patch(existing._id, { lastSeenAt: now, viewCount: existing.viewCount + 1 });
    return { counted: true };
  },
});

/** Drops view rows idle past the retention window, in self-rescheduling batches. */
export const pruneOldViews = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    const stale = await ctx.db
      .query("entryViews")
      .withIndex("by_lastSeenAt", (q) => q.lt("lastSeenAt", cutoff))
      .take(GC_BATCH);
    for (const row of stale) await ctx.db.delete(row._id);
    if (stale.length === GC_BATCH) {
      await ctx.scheduler.runAfter(0, internal.views.pruneOldViews, {});
    }
    return { deleted: stale.length };
  },
});
