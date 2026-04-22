import { z } from "zod";
import { internal } from "../../_generated/api";
import { type SkillImpl, registerSkill } from "../_libs/skillImpls";

/**
 * `memory.search` skill — M2 stub for "what do we know about X?".
 *
 * M2 behaviour: substring / case-insensitive match against the org's
 * always-on memories (the subset already visible to a turn via
 * `listAlwaysOnInternal`). Non-alwaysOn rows exist for semantic retrieval
 * and are left alone here — they need the embedding column that M3-T02 will
 * populate via the agent component's `embedMany`, and they're consumed by
 * the real vector search in M3-T04.
 *
 * The `scope` arg is about WHERE we look, not the memory-row's own scope:
 *  - `"memory"`  → our `memory` table only.
 *  - `"history"` → message history (RAG). Returns `[]` in M2 — landing in
 *                  M3-T04 once `@convex-dev/agent`'s `fetchContextMessages`
 *                  is wired. Keeping the enum value stable now so agents
 *                  that emit `scope:"history"` don't start failing
 *                  validation when the real path lights up.
 *  - `"all"`     → union. Today that's just memory; in M3 it picks up
 *                  history transparently.
 *
 * Output shape is intentionally flat and JSON-serializable because
 * `formatSuccess` in the dispatcher stringifies whatever we return into the
 * model's tool-result text. Ids travel as strings (Convex id strings are
 * opaque) so the model can echo them back in a follow-up without us having
 * to teach it Convex types.
 */

const MemorySearchArgs = z.object({
	query: z.string().min(1),
	scope: z.enum(["memory", "history", "all"]).default("all"),
	limit: z.number().int().positive().max(50).default(10),
});

export type MemorySearchHit = {
	_id: string;
	content: string;
	scope: "org" | "agent" | "thread";
	alwaysOn: boolean;
};

export const memorySearchImpl: SkillImpl = async (ctx, input, options) => {
	const args = MemorySearchArgs.parse(input);

	if (args.scope === "history") {
		// Message-history RAG lands in M3-T04. Keep the surface stable.
		return [] satisfies MemorySearchHit[];
	}

	const { orgId, agentId, threadId } = options.scope;
	const rows = await ctx.runQuery(internal.memory.queries.listAlwaysOnInternal.default, {
		orgId,
		agentId,
		threadId,
	});

	const needle = args.query.toLowerCase();
	const hits: MemorySearchHit[] = [];
	for (const row of rows) {
		if (row.content.toLowerCase().includes(needle)) {
			hits.push({
				_id: row._id,
				content: row.content,
				scope: row.scope,
				alwaysOn: row.alwaysOn,
			});
			if (hits.length >= args.limit) break;
		}
	}

	return hits;
};

registerSkill("memory.search", memorySearchImpl);
