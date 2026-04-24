import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { CostLedgerRepository } from "../adapters/costLedger.repository";

/**
 * Persist one ledger row. Called by `onStepFinish` inside agent actions
 * (M2-T15) via `ctx.runMutation` so the append happens in its own tiny
 * transaction — a single streamText turn may produce several rows (one
 * LLM step + one per tool call) and we don't want them to contend with
 * the user-message mutation.
 *
 * `createdAt` is passed in (not resolved via `Date.now()` here) so a
 * single turn's rows share the same timestamp, which keeps the thread
 * detail view (M2-T18) reading them in a deterministic order when it
 * scans by `_creationTime`.
 */
const record = internalMutation({
	args: {
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
	},
	returns: v.id("costLedger"),
	handler: async (ctx, args) => {
		const agg = await CostLedgerRepository.create(ctx, args);
		return agg.getModel()._id;
	},
});

export default record;
