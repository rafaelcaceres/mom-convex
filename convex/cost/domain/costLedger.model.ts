import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Append-only ledger — one row per billable step (LLM text generation,
 * tool call, future sandbox compute etc.). Never mutated after insert;
 * the aggregate has no state-change methods on purpose so callers can't
 * accidentally rewrite history. Dashboards (M4-T07) and per-org cost
 * limits (M4-T06) both consume this table.
 *
 * Breakdown fields (`stepType`, `toolName`) are optional so the row fits
 * both shapes without union gymnastics:
 *   - LLM step   → `stepType: "text-generation"`, `toolName: undefined`.
 *   - Tool call  → `stepType: "tool-call"`, `toolName: "http.fetch"`.
 * The writer (`onStepFinish` in M2-T15) decides what to populate.
 *
 * `agentId` + `orgId` are denormalized from the thread row so per-org
 * and per-agent aggregations don't need a JOIN. Agents don't move
 * across orgs, threads don't move across agents — denorm is safe.
 *
 * `cacheRead` / `cacheWrite` track Anthropic prompt-cache tokens
 * separately — they have different pricing than regular in/out tokens
 * and we want dashboards to show cache hit ratio.
 */

export const NewCostLedgerModel = v.object({
	orgId: v.string(),
	agentId: v.id("agents"),
	threadId: v.id("threads"),
	provider: v.string(),
	model: v.string(),
	tokensIn: v.number(),
	tokensOut: v.number(),
	cacheRead: v.number(),
	cacheWrite: v.number(),
	costUsd: v.number(),
	createdAt: v.number(),
	stepType: v.optional(v.string()),
	toolName: v.optional(v.string()),
});

export const CostLedgerModel = v.object({
	_id: v.id("costLedger"),
	_creationTime: v.number(),
	...NewCostLedgerModel.fields,
});

export type NewCostLedger = Infer<typeof NewCostLedgerModel>;
export type CostLedger = Infer<typeof CostLedgerModel>;

/**
 * Sum of ledger columns over a range. Used as the return shape of
 * `sumByOrgInRange` so dashboards get one object instead of reducing
 * arrays themselves.
 */
export type CostSum = {
	tokensIn: number;
	tokensOut: number;
	cacheRead: number;
	cacheWrite: number;
	costUsd: number;
	count: number;
};

export const EMPTY_COST_SUM: CostSum = {
	tokensIn: 0,
	tokensOut: 0,
	cacheRead: 0,
	cacheWrite: 0,
	costUsd: 0,
	count: 0,
};

export function addToSum(sum: CostSum, row: CostLedger): CostSum {
	return {
		tokensIn: sum.tokensIn + row.tokensIn,
		tokensOut: sum.tokensOut + row.tokensOut,
		cacheRead: sum.cacheRead + row.cacheRead,
		cacheWrite: sum.cacheWrite + row.cacheWrite,
		costUsd: sum.costUsd + row.costUsd,
		count: sum.count + 1,
	};
}

/**
 * Minimal aggregate — ledger rows are immutable by design so there are
 * no mutators. Kept as a class to match the repository factory contract
 * (`createRepository<Table, Aggregate>`).
 */
export class CostLedgerAgg implements IAggregate<CostLedger> {
	constructor(private readonly entry: CostLedger) {}

	getModel(): CostLedger {
		return this.entry;
	}
}
