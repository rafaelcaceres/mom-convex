import { defineTable } from "convex/server";
import { NewAgentModel } from "./domain/agent.model";

export const agentTables = {
	agents: defineTable(NewAgentModel.fields)
		.index("by_org", ["orgId"])
		.index("by_org_slug", ["orgId", "slug"])
		.index("by_org_isDefault", ["orgId", "isDefault"]),
};
