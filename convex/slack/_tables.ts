import { defineTable } from "convex/server";
import { NewSlackEventDedupeModel } from "./domain/slackEventDedupe.model";
import { NewSlackInstallModel } from "./domain/slackInstall.model";

export const slackTables = {
	slackInstalls: defineTable(NewSlackInstallModel.fields)
		.index("by_teamId", ["teamId"])
		.index("by_org", ["orgId"]),
	slackEventDedupe: defineTable(NewSlackEventDedupeModel.fields)
		.index("by_eventId", ["eventId"])
		.index("by_seenAt", ["seenAt"]),
};
