import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("enqueue due source ingest", { minutes: 15 }, internal.ingest.enqueueDueSourceIngest, {});
crons.interval("run queued ingest", { minutes: 5 }, internal.ingest.runQueuedIngest, {});
crons.interval("promote completed ingest", { minutes: 10 }, internal.ingest.promoteCompletedIngest, {});
crons.interval("auto-apply tier 1 ingest", { minutes: 10 }, internal.ingest.autoApplyTier1Ingest, {});
crons.interval("prune rate limit buckets", { hours: 6 }, internal.data.pruneRateLimitBuckets, {});

export default crons;
