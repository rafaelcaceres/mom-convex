import { defineTable } from "convex/server";
import { NewAgentSkillModel } from "./domain/agentSkill.model";
import { NewSkillCatalogModel } from "./domain/skill.model";

export const skillTables = {
	skillCatalog: defineTable(NewSkillCatalogModel.fields)
		.index("by_key", ["key"])
		.index("by_enabled", ["enabled"]),
	agentSkills: defineTable(NewAgentSkillModel.fields)
		.index("by_agent", ["agentId"])
		.index("by_agent_skillKey", ["agentId", "skillKey"])
		.index("by_agent_enabled", ["agentId", "enabled"])
		.index("by_org", ["orgId"]),
};
