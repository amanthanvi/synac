import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("prune old entry views", { hours: 24 }, internal.views.pruneOldViews, {});

export default crons;
