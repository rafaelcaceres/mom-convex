import type { QueryCtx } from "../../_generated/server";
import { createRepository } from "../../_shared/_libs/repository";
import { MemoryAgg, type MemoryScope } from "../domain/memory.model";
import type { IMemoryRepository } from "../domain/memory.repository";

/**
 * Upper bound on rows pulled per scope before we start paginating.
 *
 * Org-wide memories are user-authored — a handful per org is the norm. Agent
 * and thread scopes follow the same shape. If a deployment ever pushes past
 * this, paginate in the system-prompt builder instead of pulling more here
 * (an oversized system prompt is the real failure mode).
 */
const MAX_MEMORIES_PER_SCOPE = 500;

async function listByOrgScope(
	ctx: QueryCtx,
	orgId: string,
	scope: MemoryScope,
): Promise<MemoryAgg[]> {
	const docs = await ctx.db
		.query("memory")
		.withIndex("by_org_scope", (q) => q.eq("orgId", orgId).eq("scope", scope))
		.take(MAX_MEMORIES_PER_SCOPE);
	return docs.map((doc) => new MemoryAgg(doc));
}

export const MemoryRepository: IMemoryRepository = {
	...createRepository("memory", (doc) => new MemoryAgg(doc)),

	listForAgent: async (ctx, { orgId, agentId }) => {
		const [orgRows, agentRows] = await Promise.all([
			listByOrgScope(ctx, orgId, "org"),
			listByOrgScope(ctx, orgId, "agent"),
		]);
		const scoped = agentRows.filter((agg) => agg.getModel().agentId === agentId);
		return [...orgRows, ...scoped];
	},

	listForThread: async (ctx, { orgId, agentId, threadId, channelKey }) => {
		const [orgRows, agentRows, threadRows, channelRows] = await Promise.all([
			listByOrgScope(ctx, orgId, "org"),
			listByOrgScope(ctx, orgId, "agent"),
			listByOrgScope(ctx, orgId, "thread"),
			// No channel on this turn (web chat, scheduled event) ⇒ no channel
			// rows. Skipping the query entirely, rather than fetching and
			// filtering, keeps "absent key" from ever degrading into "any key".
			channelKey === undefined
				? Promise.resolve([] as MemoryAgg[])
				: MemoryRepository.listForChannel(ctx, { orgId, channelKey }),
		]);
		const agentScoped = agentRows.filter((agg) => agg.getModel().agentId === agentId);
		const threadScoped = threadRows.filter((agg) => agg.getModel().threadId === threadId);
		return [...orgRows, ...agentScoped, ...channelRows, ...threadScoped];
	},

	listForChannel: async (ctx, { orgId, channelKey }) => {
		const docs = await ctx.db
			.query("memory")
			.withIndex("by_org_channel", (q) => q.eq("orgId", orgId).eq("channelKey", channelKey))
			.take(MAX_MEMORIES_PER_SCOPE);
		return docs.map((doc) => new MemoryAgg(doc));
	},

	listAlwaysOn: async (ctx, clause) => {
		const full = await MemoryRepository.listForThread(ctx, clause);
		return full.filter((agg) => agg.getModel().alwaysOn);
	},

	listMissingEmbedding: async (ctx, { limit }) => {
		// A full-table filter, not an index: "has no vector" is a transient state
		// that a healthy deployment converges out of, so indexing it would cost a
		// write on every memory forever to serve a query we run once.
		const docs = await ctx.db
			.query("memory")
			.filter((q) => q.eq(q.field("embedding"), undefined))
			.take(limit);
		return docs.map((doc) => new MemoryAgg(doc));
	},

	listVisibleByIds: async (ctx, { orgId, agentId, threadId, channelKey, ids }) => {
		const rows = await Promise.all(ids.map((id) => MemoryRepository.get(ctx, id)));
		return rows.filter((agg): agg is MemoryAgg => {
			if (agg === null) return false;
			// Re-check the tenant on the row rather than trusting the vector index's
			// filter: this is the last hop before content reaches the model, and it
			// costs one field comparison.
			if (agg.getModel().orgId !== orgId) return false;
			return agg.matchesScope({ agentId, threadId, channelKey });
		});
	},
};
