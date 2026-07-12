import { embedMany } from "@convex-dev/agent";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../customFunctions";
import { resolveEmbeddingModel } from "../_libs/embedding";

/**
 * Vectorize one memory row's content and write the vector back.
 *
 * Scheduled (never called directly) by the `memory` trigger in
 * `convex/memory/_triggers.ts` on insert, and on any update that changes
 * `content`.
 *
 * We go through `embedMany` from `@convex-dev/agent` rather than the AI SDK's
 * `embedMany` directly. Today the two are near-equivalent for a single value,
 * but the component's wrapper is where a `usageHandler` would hook in — which
 * is the seam we'll need when embedding spend gets metered. (It isn't today:
 * `costLedger` requires `agentId` + `threadId`, and an org-scoped memory has
 * neither. See follow-up F-07.)
 *
 * Failure policy: we let the action throw. Convex retries scheduled functions
 * on failure, and a memory without a vector is degraded (invisible to semantic
 * search) but not corrupt — `content` is intact and `alwaysOn` rows still
 * reach the model through the system prompt. Swallowing the error would leave
 * the row permanently unsearchable with nothing in the logs to show why.
 */
const embed = internalAction({
	args: {
		memoryId: v.id("memory"),
		content: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const { embeddings } = await embedMany(ctx, {
			// Both are usage-handler context, not retrieval scoping. A memory row
			// isn't owned by a chat thread (org- and agent-scoped rows have no
			// thread at all), so there is no honest value to pass here.
			userId: undefined,
			threadId: undefined,
			values: [args.content],
			embeddingModel: resolveEmbeddingModel(),
		});

		const vector = embeddings[0];
		if (!vector) {
			throw new Error(`embedMany returned no vector for memory ${args.memoryId}`);
		}

		const applied: boolean = await ctx.runMutation(
			internal.memory.mutations.setEmbeddingInternal.default,
			{ memoryId: args.memoryId, content: args.content, embedding: vector },
		);

		// Structured so Convex log search can slice on it. A skip is normal
		// (row edited or deleted mid-flight), not an error — but if skips
		// dominate, something is rewriting memories in a hot loop.
		console.log(
			JSON.stringify({
				type: "memory.embed",
				memoryId: args.memoryId,
				status: applied ? "applied" : "skipped",
				dimensions: vector.length,
			}),
		);

		return null;
	},
});

export default embed;
