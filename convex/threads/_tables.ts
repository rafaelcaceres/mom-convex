import { defineTable } from "convex/server";
import { NewThreadModel } from "./domain/thread.model";

export const threadTables = {
	threads: defineTable(NewThreadModel.fields)
		.index("by_org", ["orgId"])
		.index("by_agent", ["agentId"])
		.index("by_org_binding", ["orgId", "bindingKey"]),
};
