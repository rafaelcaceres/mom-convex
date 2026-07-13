import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { channelKeyFromBinding } from "../../threads/domain/thread.model";
import { MemoryRepository } from "../adapters/memory.repository";
import { MemoryModel } from "../domain/memory.model";

/**
 * Hydrate the ids a vector search returned, keeping only what this turn may see.
 *
 * `ctx.vectorSearch` runs in an action and hands back `{_id, _score}` — no
 * documents. This is the query side of that round trip (M3-T04).
 *
 * The channel key is derived from the thread here, exactly as in
 * `listAlwaysOnInternal`, and for the same reason: a caller that could pass its
 * own key could read another room's memories by naming it. Retrieval and the
 * system prompt therefore answer "what is visible to this turn?" with the same
 * function (`MemoryAgg.matchesScope`) rather than two rules that can drift apart.
 */
const listVisibleByIdsInternal = internalQuery({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		threadId: v.id("threads"),
		ids: v.array(v.id("memory")),
	},
	returns: v.array(MemoryModel),
	handler: async (ctx, args) => {
		const thread = await ThreadRepository.get(ctx, args.threadId);
		const channelKey = thread ? channelKeyFromBinding(thread.getModel().binding) : undefined;

		const rows = await MemoryRepository.listVisibleByIds(ctx, { ...args, channelKey });
		return rows.map((r) => r.getModel());
	},
});

export default listVisibleByIdsInternal;
