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

	listForThread: async (ctx, { orgId, agentId, threadId }) => {
		const [orgRows, agentRows, threadRows] = await Promise.all([
			listByOrgScope(ctx, orgId, "org"),
			listByOrgScope(ctx, orgId, "agent"),
			listByOrgScope(ctx, orgId, "thread"),
		]);
		const agentScoped = agentRows.filter((agg) => agg.getModel().agentId === agentId);
		const threadScoped = threadRows.filter((agg) => agg.getModel().threadId === threadId);
		return [...orgRows, ...agentScoped, ...threadScoped];
	},

	listAlwaysOn: async (ctx, clause) => {
		const full = await MemoryRepository.listForThread(ctx, clause);
		return full.filter((agg) => agg.getModel().alwaysOn);
	},
};
