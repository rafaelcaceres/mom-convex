import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
	"slack:cleanExpiredDedupe",
	{ hours: 1 },
	internal.slack.mutations.cleanExpiredDedupe.default,
	{},
);

export default crons;
