import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"slack:cleanExpiredDedupe",
	{ hours: 1 },
	internal.slack.mutations.cleanExpiredDedupe.default,
	{},
);

// Sandbox GC sweeps `active` rows idle for >7 days, stopping the Vercel VM
// and tombstoning the DB row. 03:00 UTC is quiet for both US and EU.
crons.daily("sandbox:gc", { hourUTC: 3, minuteUTC: 0 }, internal.sandbox.actions.gc.default, {});

export default crons;
