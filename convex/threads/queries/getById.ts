import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { ThreadRepository } from "../adapters/thread.repository";
import { ThreadModel } from "../domain/thread.model";

/**
 * Internal-only thread lookup. Used by the agentRunner action to read the
 * binding and dispatch outbound adapters (e.g. Slack postMessage).
 */
const getById = internalQuery({
	args: { threadId: v.id("threads") },
	returns: v.union(ThreadModel, v.null()),
	handler: async (ctx, args) => {
		const agg = await ThreadRepository.get(ctx, args.threadId);
		return agg?.getModel() ?? null;
	},
});

export default getById;
