import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { CostLedgerRepository } from "../adapters/costLedger.repository";

/**
 * Per-thread cost roll-up consumed by the thread detail page (M2-T18).
 * Returns the total token/cost sum plus a per-tool breakdown sorted by
 * cost descending.
 *
 * Ownership is derived from the thread's web binding so a user can only
 * read costs for threads they own — never trust a client-supplied id
 * without re-checking the binding.
 */

const CostSumValidator = v.object({
	tokensIn: v.number(),
	tokensOut: v.number(),
	cacheRead: v.number(),
	cacheWrite: v.number(),
	costUsd: v.number(),
	count: v.number(),
});

const byThread = query({
	args: { threadId: v.id("threads") },
	returns: v.object({
		sum: CostSumValidator,
		byTool: v.array(
			v.object({
				toolName: v.string(),
				sum: CostSumValidator,
			}),
		),
		truncated: v.boolean(),
	}),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Authentication required");

		const thread = await ThreadRepository.get(ctx, args.threadId);
		if (!thread) throw new Error("Thread not found");
		const model = thread.getModel();
		if (model.binding.type !== "web" || model.binding.userId !== userId) {
			throw new Error("Forbidden");
		}

		return await CostLedgerRepository.summarizeByThread(ctx, { threadId: args.threadId });
	},
});

export default byThread;
