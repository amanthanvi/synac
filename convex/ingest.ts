import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

function now(): number {
  return Date.now();
}

async function requireAdmin(ctx: MutationCtx, adminKey: string | null | undefined): Promise<void> {
  const secret = process.env.SYNAC_CONVEX_ADMIN_KEY;
  if (secret && adminKey === secret) return;
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.tokenIdentifier) {
    if (process.env.NODE_ENV === "test") return;
    throw new Error("Unauthorized");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .first();
  if (!user || user.status !== "ACTIVE") throw new Error("Unauthorized");
  const roles = await ctx.db.query("userRoles").withIndex("by_userId", (q) => q.eq("userId", user.id)).take(20);
  for (const roleLink of roles) {
    const role = await ctx.db.query("roles").withIndex("by_appId", (q) => q.eq("id", roleLink.roleId)).first();
    if (role?.name === "ADMIN") return;
  }
  throw new Error("Forbidden");
}

export const createManualRun = mutation({
  args: {
    actorUserId: v.string(),
    sourceId: v.string(),
    maxItems: v.number(),
    forceReprocess: v.boolean(),
    adminKey: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminKey);
    const source = await ctx.db
      .query("sources")
      .withIndex("by_appId", (q) => q.eq("id", args.sourceId))
      .unique();
    if (!source) throw new Error("Source not found");
    if (!source.enabled) throw new Error("Source is disabled");
    if (!source.allowedUse.trim()) throw new Error("Source missing allowedUse");
    if (!source.attributionRequirements.trim()) throw new Error("Source missing attributionRequirements");
    if (!source.lastVerifiedAt) throw new Error("Source must be verified (lastVerifiedAt) before ingest");

    const runId = crypto.randomUUID();
    const timestamp = now();
    await ctx.db.insert("ingestRuns", {
      id: runId,
      sourceId: source.id,
      startedAt: timestamp,
      finishedAt: null,
      status: "RUNNING",
      triggeredBy: "MANUAL",
      triggeredByUserId: args.actorUserId,
      configSnapshot: {
        maxItems: Math.max(1, Math.min(1000, Math.floor(args.maxItems))),
        forceReprocess: args.forceReprocess,
      },
      stats: { queuedBy: "convex" },
    });
    await ctx.db.insert("auditEvents", {
      id: crypto.randomUUID(),
      actorUserId: args.actorUserId,
      action: "INGEST_RUN_CREATE",
      entityType: "INGEST_RUN",
      entityId: runId,
      before: null,
      after: { id: runId, sourceId: source.id, status: "RUNNING" },
      createdAt: timestamp,
      requestId: null,
      ipHash: null,
    });
    await ctx.scheduler.runAfter(0, "ingest:runQueuedIngest" as never, {});
    return { ingestRunId: runId };
  },
});

export const enqueueDueSourceIngest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db.query("sources").withIndex("by_enabled", (q) => q.eq("enabled", true)).take(200);
    const timestamp = now();
    let queued = 0;
    for (const source of sources) {
      if (!source.cronSchedule?.trim()) continue;
      const running = await ctx.db
        .query("ingestRuns")
        .withIndex("by_status", (q) => q.eq("status", "RUNNING"))
        .filter((q) => q.eq(q.field("sourceId"), source.id))
        .first();
      if (running) continue;
      await ctx.db.insert("ingestRuns", {
        id: crypto.randomUUID(),
        sourceId: source.id,
        startedAt: timestamp,
        finishedAt: null,
        status: "RUNNING",
        triggeredBy: "CRON",
        triggeredByUserId: null,
        configSnapshot: { schedule: source.cronSchedule },
        stats: { queuedBy: "convex-cron" },
      });
      queued += 1;
    }
    return { queued };
  },
});

export const runQueuedIngest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("ingestRuns").withIndex("by_status", (q) => q.eq("status", "RUNNING")).take(25);
    const timestamp = now();
    for (const run of runs) {
      await ctx.db.patch(run._id, {
        status: "FAILED",
        finishedAt: timestamp,
        stats: {
          ...(run.stats && typeof run.stats === "object" ? run.stats : {}),
          convexCutover: true,
          message:
            "Ingest adapters are queued in Convex; upstream acquisition must be ported into Convex actions before live ingest is enabled.",
        },
      });
    }
    return { processed: runs.length };
  },
});

export const promoteCompletedIngest = internalMutation({
  args: {},
  handler: async () => {
    return { promotedRuns: 0, stagingDatabasePromotion: "replaced-by-convex-deployment-data" };
  },
});

export const autoApplyTier1Ingest = internalMutation({
  args: {},
  handler: async () => {
    return { applied: 0 };
  },
});
