import { createRepository } from "../../_shared/_libs/repository";
import { ThreadAgg } from "../domain/thread.model";
import type { IThreadRepository } from "../domain/thread.repository";

export const ThreadRepository: IThreadRepository = {
	...createRepository("threads", (doc) => new ThreadAgg(doc)),

	getByOrgBinding: async (ctx, { orgId, bindingKey }) => {
		const doc = await ctx.db
			.query("threads")
			.withIndex("by_org_binding", (q) => q.eq("orgId", orgId).eq("bindingKey", bindingKey))
			.unique();
		if (!doc) return null;
		return new ThreadAgg(doc);
	},

	listByAgent: async (ctx, { agentId }) => {
		const docs = await ctx.db
			.query("threads")
			.withIndex("by_agent", (q) => q.eq("agentId", agentId))
			.collect();
		return docs.map((doc) => new ThreadAgg(doc));
	},

	listByOrg: async (ctx, { orgId }) => {
		const docs = await ctx.db
			.query("threads")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		return docs.map((doc) => new ThreadAgg(doc));
	},
};
