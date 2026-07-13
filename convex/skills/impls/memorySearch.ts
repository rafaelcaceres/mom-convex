import { z } from "zod";
import { internal } from "../../_generated/api";
import type { MemoryScope } from "../../memory/domain/memory.model";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * `memory.search` skill — "what do we know about X?".
 *
 * Two sources, two retrieval mechanisms, and they are not the same mechanism:
 *
 *  - `"memory"`  → the `memory` table, by **semantic similarity**
 *                  (`ctx.vectorSearch` on `by_embedding`, M3-T04). Reaches rows
 *                  the model has never seen, including `alwaysOn: false` ones
 *                  that exist purely to be retrieved.
 *  - `"history"` → this thread's messages, by **keyword**. The component only
 *                  embeds messages when the Agent carries a `textEmbeddingModel`
 *                  and ours doesn't, so a vector query here would search an empty
 *                  index and return nothing forever. Full-text is what the data
 *                  supports; F-10 tracks embedding messages. Saying "semantic"
 *                  to the model when we mean "keyword" would just teach it to
 *                  trust an empty result.
 *  - `"all"`     → both, concurrently. The default, because the model rarely
 *                  knows which side a fact was written down on.
 *
 * Results are grouped by source rather than interleaved into one ranked list: a
 * cosine score and a full-text match are not commensurable, and inventing a
 * blended score would be a number with no meaning attached to it.
 *
 * Scope isolation (which memories this turn may see at all) is enforced
 * server-side in `listVisibleByIdsInternal`, off the thread's own binding — not
 * here, and never from anything the model supplies.
 */

const MemorySearchArgs = z.object({
	query: z.string().min(1),
	scope: z.enum(["memory", "history", "all"]).default("all"),
	limit: z.number().int().positive().max(50).default(10),
});

export type MemoryHit = {
	_id: string;
	content: string;
	scope: MemoryScope;
	alwaysOn: boolean;
	/** Cosine similarity against the query. Only comparable to other memory hits. */
	score: number;
};

export type MessageHit = {
	messageId: string;
	role: string;
	text: string;
	order: number;
};

export type MemorySearchResult = {
	memories: MemoryHit[];
	messages: MessageHit[];
};

export const memorySearchImpl: SkillImpl = async (ctx, input, options) => {
	const args = MemorySearchArgs.parse(input);
	const { orgId, agentId, threadId, agentThreadId } = options.scope;

	const wantsMemory = args.scope !== "history";
	const wantsHistory = args.scope !== "memory";

	const [memories, messages] = await Promise.all([
		wantsMemory
			? ctx.runAction(internal.memory.actions.search.default, {
					orgId,
					agentId,
					threadId,
					query: args.query,
					limit: args.limit,
				})
			: Promise.resolve([] as MemoryHit[]),
		wantsHistory
			? ctx.runAction(internal.agents.actions.searchHistory.default, {
					agentThreadId,
					query: args.query,
					limit: args.limit,
				})
			: Promise.resolve([] as MessageHit[]),
	]);

	return { memories, messages } satisfies MemorySearchResult;
};

registerSkill("memory.search", memorySearchImpl);
