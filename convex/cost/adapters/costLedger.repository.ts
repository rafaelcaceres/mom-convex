import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { createRepository } from "../../_shared/_libs/repository";
import { CostLedgerAgg, type CostSum, EMPTY_COST_SUM, addToSum } from "../domain/costLedger.model";
import type { ICostLedgerRepository } from "../domain/costLedger.repository";

/**
 * Upper bound on rows pulled in a single aggregation query. Dashboards
 * operate on "last 24h" / "last 7d" ranges — at one row per turn per
 * tool call, 10k is headroom for 2-3 days of a chatty org. If the
 * `truncated` flag trips, the UI asks the user to narrow the range
 * rather than paying for an unbounded scan.
 */
const MAX_ROWS_PER_QUERY = 10_000;
const DEFAULT_TOP_LIMIT = 10;

async function collectInRange(
	ctx: QueryCtx,
	orgId: string,
	from: number,
	to: number,
): Promise<{ rows: CostLedgerAgg[]; truncated: boolean }> {
	const docs = await ctx.db
		.query("costLedger")
		.withIndex("by_org_date", (q) =>
			q.eq("orgId", orgId).gte("createdAt", from).lt("createdAt", to),
		)
		.take(MAX_ROWS_PER_QUERY + 1);
	const truncated = docs.length > MAX_ROWS_PER_QUERY;
	const rows = (truncated ? docs.slice(0, MAX_ROWS_PER_QUERY) : docs).map(
		(doc) => new CostLedgerAgg(doc),
	);
	return { rows, truncated };
}

async function collectByThread(
	ctx: QueryCtx,
	threadId: Id<"threads">,
): Promise<{ rows: CostLedgerAgg[]; truncated: boolean }> {
	const docs = await ctx.db
		.query("costLedger")
		.withIndex("by_thread", (q) => q.eq("threadId", threadId))
		.take(MAX_ROWS_PER_QUERY + 1);
	const truncated = docs.length > MAX_ROWS_PER_QUERY;
	const rows = (truncated ? docs.slice(0, MAX_ROWS_PER_QUERY) : docs).map(
		(doc) => new CostLedgerAgg(doc),
	);
	return { rows, truncated };
}

function topNByCost<K extends string>(
	groups: Map<K, CostSum>,
	limit: number,
): Array<{ key: K; sum: CostSum }> {
	return [...groups.entries()]
		.map(([key, sum]) => ({ key, sum }))
		.sort((a, b) => b.sum.costUsd - a.sum.costUsd)
		.slice(0, limit);
}

export const CostLedgerRepository: ICostLedgerRepository = {
	...createRepository("costLedger", (doc) => new CostLedgerAgg(doc)),

	sumByOrgInRange: async (ctx, { orgId, from, to }) => {
		const { rows, truncated } = await collectInRange(ctx, orgId, from, to);
		const sum = rows.reduce((acc, r) => addToSum(acc, r.getModel()), { ...EMPTY_COST_SUM });
		return { sum, truncated };
	},

	topThreadsByCost: async (ctx, { orgId, from, to, limit }) => {
		const { rows } = await collectInRange(ctx, orgId, from, to);
		const groups = new Map<Id<"threads">, CostSum>();
		for (const agg of rows) {
			const model = agg.getModel();
			const prev = groups.get(model.threadId) ?? { ...EMPTY_COST_SUM };
			groups.set(model.threadId, addToSum(prev, model));
		}
		return topNByCost(groups, limit ?? DEFAULT_TOP_LIMIT).map(({ key, sum }) => ({
			threadId: key,
			sum,
		}));
	},

	topToolsByCost: async (ctx, { orgId, from, to, limit }) => {
		const { rows } = await collectInRange(ctx, orgId, from, to);
		const groups = new Map<string, CostSum>();
		for (const agg of rows) {
			const model = agg.getModel();
			if (!model.toolName) continue;
			const prev = groups.get(model.toolName) ?? { ...EMPTY_COST_SUM };
			groups.set(model.toolName, addToSum(prev, model));
		}
		return topNByCost(groups, limit ?? DEFAULT_TOP_LIMIT).map(({ key, sum }) => ({
			toolName: key,
			sum,
		}));
	},

	summarizeByThread: async (ctx, { threadId }) => {
		const { rows, truncated } = await collectByThread(ctx, threadId);
		const sum = rows.reduce((acc, r) => addToSum(acc, r.getModel()), { ...EMPTY_COST_SUM });
		const groups = new Map<string, CostSum>();
		for (const agg of rows) {
			const model = agg.getModel();
			if (!model.toolName) continue;
			const prev = groups.get(model.toolName) ?? { ...EMPTY_COST_SUM };
			groups.set(model.toolName, addToSum(prev, model));
		}
		const byTool = [...groups.entries()]
			.map(([toolName, s]) => ({ toolName, sum: s }))
			.sort((a, b) => b.sum.costUsd - a.sum.costUsd);
		return { sum, byTool, truncated };
	},
};
