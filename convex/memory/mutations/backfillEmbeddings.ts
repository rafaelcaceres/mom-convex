import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation } from "../../customFunctions";
import { MemoryRepository } from "../adapters/memory.repository";

/**
 * Schedule an embed for every memory that doesn't have one yet. One-shot, run by
 * an operator:
 *
 *   pnpm exec convex run memory/mutations/backfillEmbeddings '{"limit":500}'
 *
 * **Why this has to exist.** The embedding trigger (M3-T02) fires on insert and
 * on a content change — and nothing else, deliberately, so that the vector
 * write-back doesn't re-trigger itself. The consequence is that any memory
 * written *before* that trigger shipped has no vector and never will: the only
 * event that would give it one is an edit, and nobody edits a memory in order to
 * make it findable. Those rows are invisible to `memory.search` (M3-T04) while
 * looking perfectly healthy in the dashboard — the failure is silent, which is
 * exactly why it needs a deliberate fix rather than a note in a runbook.
 *
 * Bounded by `limit` and safe to re-run: each pass picks up whatever is still
 * missing a vector, so a large backlog is drained by running it a few times
 * rather than by one mutation trying to schedule thousands of actions inside a
 * single transaction. Re-running once the backlog is clear schedules nothing.
 *
 * Not org-scoped, and not user-facing: unembedded rows are an artifact of *our*
 * deploy history, not of any one tenant's data, and there is no caller identity
 * in a CLI invocation to check anyway.
 */
const backfillEmbeddings = internalMutation({
	args: { limit: v.optional(v.number()) },
	returns: v.object({ scheduled: v.number() }),
	handler: async (ctx, args) => {
		const rows = await MemoryRepository.listMissingEmbedding(ctx, { limit: args.limit ?? 100 });

		for (const agg of rows) {
			const memory = agg.getModel();
			await ctx.scheduler.runAfter(0, internal.memory.actions.embed.default, {
				memoryId: memory._id,
				// Same compare-and-set contract as the trigger: the action re-checks
				// this content against the row before writing, so a memory edited
				// while the backfill is draining doesn't end up with a stale vector.
				content: memory.content,
			});
		}

		console.log(JSON.stringify({ type: "memory.backfillEmbeddings", scheduled: rows.length }));
		return { scheduled: rows.length };
	},
});

export default backfillEmbeddings;
