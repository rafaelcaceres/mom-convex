import type { Change } from "convex-helpers/server/triggers";
import { internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Keeps `memory.embedding` in sync with `memory.content`.
 *
 * **Async, not inline.** The trigger only *schedules* the work; it never
 * embeds inside the transaction. Two reasons:
 *
 *  1. Embedding is a network call to OpenAI. Convex mutations are
 *     transactions and cannot perform I/O — this isn't a preference, it's
 *     the runtime.
 *  2. Blast radius. If the embedding provider is down, a user saving a memory
 *     still succeeds; the row is simply unsearchable until the action
 *     succeeds. Rolling back the user's write because a third party had a bad
 *     minute would be the wrong trade.
 *
 * The cost of that choice is eventual consistency: a freshly-written memory is
 * readable immediately but not *searchable* until the scheduled action lands
 * (~1s). `alwaysOn` rows are unaffected — they reach the model through the
 * system prompt (M2-T09), which reads `content` directly and never touches the
 * vector.
 *
 * **Loop guard.** The embedding is written back into this same table, which
 * re-fires this trigger. The `content` comparison below is what stops the
 * recursion: the write-back changes only `embedding`, so `oldDoc.content ===
 * newDoc.content` and we return without scheduling. Any future field added to
 * this table is likewise ignored unless it changes `content` — an `alwaysOn`
 * toggle or a `touch()` does not burn an embedding call.
 *
 * **Deletes** need no handling: the vector is a field on the row, so it dies
 * with it. There is no external index to clean up (this is the payoff of the
 * 2026-04-18 decision to use Convex's native `vectorIndex` instead of
 * `@convex-dev/rag`, which would have required an explicit `rag.delete`).
 */
export async function syncMemoryEmbedding(
	ctx: MutationCtx,
	change: Change<DataModel, "memory">,
): Promise<void> {
	if (change.operation === "delete") return;

	const next = change.newDoc;

	// Content unchanged ⇒ the existing vector still describes this row. This is
	// also the branch that catches our own embedding write-back.
	if (change.operation === "update" && change.oldDoc.content === next.content) return;

	await ctx.scheduler.runAfter(0, internal.memory.actions.embed.default, {
		memoryId: next._id,
		// Pass the content we're embedding *for*. The action re-checks it against
		// the row before writing, so a rapid second edit can't be overwritten by
		// the older call's vector landing late.
		content: next.content,
	});
}
