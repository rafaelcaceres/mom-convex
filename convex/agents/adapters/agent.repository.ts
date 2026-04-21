import { createRepository } from "../../_shared/_libs/repository";
import { AgentAgg } from "../domain/agent.model";
import type { IAgentRepository } from "../domain/agent.repository";

export const AgentRepository: IAgentRepository = {
	...createRepository("agents", (doc) => new AgentAgg(doc)),

	byOrgSlug: async (ctx, { orgId, slug }) => {
		const doc = await ctx.db
			.query("agents")
			.withIndex("by_org_slug", (q) => q.eq("orgId", orgId).eq("slug", slug))
			.unique();
		if (!doc) return null;
		return new AgentAgg(doc);
	},

	listByOrg: async (ctx, { orgId }) => {
		const docs = await ctx.db
			.query("agents")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		return docs.map((doc) => new AgentAgg(doc));
	},

	findDefault: async (ctx, { orgId }) => {
		const doc = await ctx.db
			.query("agents")
			.withIndex("by_org_isDefault", (q) => q.eq("orgId", orgId).eq("isDefault", true))
			.unique();
		if (!doc) return null;
		return new AgentAgg(doc);
	},
};
