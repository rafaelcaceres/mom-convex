import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { CostLedgerAgg, CostSum } from "./costLedger.model";

/**
 * Dashboard-shaped queries — each one corresponds to a panel the
 * `/observability` page (M4-T07) will render. Kept narrow on purpose:
 * the repo aggregates **inside** a single query so the UI doesn't have
 * to reduce over raw rows.
 */
export interface ICostLedgerRepository extends IRepository<"costLedger", CostLedgerAgg> {
	/**
	 * Sum of all ledger entries for `orgId` where `createdAt ∈ [from, to)`.
	 * Bounded internally by a row cap — returns the sum AND a `truncated`
	 * flag so callers can warn ("showing partial stats, narrow your range").
	 */
	sumByOrgInRange(
		ctx: QueryCtx,
		args: { orgId: string; from: number; to: number },
	): Promise<{ sum: CostSum; truncated: boolean }>;

	/**
	 * Top `limit` threads by total `costUsd` in `[from, to)`. Each entry
	 * carries the thread id + the per-thread sum so the dashboard can
	 * link straight to `/threads/[id]`.
	 */
	topThreadsByCost(
		ctx: QueryCtx,
		args: { orgId: string; from: number; to: number; limit?: number },
	): Promise<Array<{ threadId: Id<"threads">; sum: CostSum }>>;

	/**
	 * Top `limit` tools by total `costUsd` in `[from, to)`. Only rows that
	 * have `toolName` set participate (LLM-only steps are ignored).
	 */
	topToolsByCost(
		ctx: QueryCtx,
		args: { orgId: string; from: number; to: number; limit?: number },
	): Promise<Array<{ toolName: string; sum: CostSum }>>;

	/**
	 * Per-thread roll-up for the thread detail page (M2-T18). Returns the
	 * full sum of ledger rows for the thread plus a tool-name breakdown
	 * (only rows with `toolName` participate). Bounded by an internal row
	 * cap; if `truncated` trips the UI shows a partial-stats warning.
	 */
	summarizeByThread(
		ctx: QueryCtx,
		args: { threadId: Id<"threads"> },
	): Promise<{
		sum: CostSum;
		byTool: Array<{ toolName: string; sum: CostSum }>;
		truncated: boolean;
	}>;
}
