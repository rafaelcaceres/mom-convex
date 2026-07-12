import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { channelKeyFromBinding } from "../../threads/domain/thread.model";
import { MemoryRepository } from "../adapters/memory.repository";
import { MemoryModel } from "../domain/memory.model";

/**
 * Always-on memories visible to a specific turn. Exposed as an internalQuery
 * so the system-prompt builder (M2-T09 — runs from the agent action) can load
 * them via `ctx.runQuery` without a user-facing auth hop. The builder runs
 * *inside* a turn, so the caller (handleIncoming) has already established the
 * org/agent context.
 *
 * The channel key is derived here rather than accepted as an argument: it is a
 * pure function of the thread's binding, and letting callers pass their own
 * would make it possible to read another channel's memories by supplying its
 * key. Deriving it server-side from the thread makes that unrepresentable.
 */
const listAlwaysOnInternal = internalQuery({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		threadId: v.id("threads"),
	},
	returns: v.array(MemoryModel),
	handler: async (ctx, args) => {
		const thread = await ThreadRepository.get(ctx, args.threadId);
		const channelKey = thread ? channelKeyFromBinding(thread.getModel().binding) : undefined;

		const rows = await MemoryRepository.listAlwaysOn(ctx, { ...args, channelKey });
		return rows.map((r) => r.getModel());
	},
});

export default listAlwaysOnInternal;
