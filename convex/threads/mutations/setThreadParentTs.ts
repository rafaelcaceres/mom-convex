import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { ThreadRepository } from "../adapters/thread.repository";

/**
 * Persist the slack anchor `ts` on a thread's binding so a retried turn
 * can reattach tool-call replies under the same main message instead of
 * posting a duplicate (F-03). No-op when the thread is missing or non-slack;
 * the aggregate setter throws on the binding-type mismatch as a guardrail.
 */
const setThreadParentTs = internalMutation({
	args: {
		threadId: v.id("threads"),
		ts: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const agg = await ThreadRepository.get(ctx, args.threadId);
		if (!agg) return null;
		agg.setParentTs(args.ts);
		await ThreadRepository.save(ctx, agg);
		return null;
	},
});

export default setThreadParentTs;
