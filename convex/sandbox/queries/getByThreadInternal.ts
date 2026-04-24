import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { SandboxRepository } from "../adapters/sandbox.repository";
import { SandboxModel } from "../domain/sandbox.model";

/**
 * Lookup for the reachable (`active` / `stopped`) sandbox bound to a thread.
 * Exposed as an internalQuery so the sandbox skill impls (M2-T12), which run
 * inside an action, can load it via `ctx.runQuery` without an identity hop.
 */
const getByThreadInternal = internalQuery({
	args: { threadId: v.id("threads") },
	returns: v.union(SandboxModel, v.null()),
	handler: async (ctx, args) => {
		const agg = await SandboxRepository.getByThread(ctx, args.threadId);
		return agg ? agg.getModel() : null;
	},
});

export default getByThreadInternal;
