import { embedMany } from "@convex-dev/agent";
import { type Infer, v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../customFunctions";
import type { Memory } from "../../memory/domain/memory.model";
import { EMBEDDING_DIMENSIONS, resolveEmbeddingModel } from "../_libs/embedding";
import { MemoryScopeModel } from "../domain/memory.model";

/**
 * Semantic search over the org's memories — the retrieval half of the loop
 * whose write half is M3-T02 (M3-T04).
 *
 * Query text is embedded with the *same* model that embedded the rows. That is
 * not a preference: cosine distance between vectors from different models is
 * noise, so `resolveEmbeddingModel` is the single source of truth for both
 * paths, and a model swap is a migration for both at once.
 *
 * An action, because `ctx.vectorSearch` exists only in the action runtime and
 * embedding the query is a network call. It hands back `{_id, _score}` and no
 * documents, so hydration is a second hop through `listVisibleByIdsInternal` —
 * which is also where scope isolation is re-applied (the vector index can only
 * filter on `orgId`).
 *
 * Rows whose embedding hasn't landed yet are simply absent from the index and
 * therefore invisible here — the eventual-consistency window M3-T02 bought
 * deliberately. `alwaysOn` rows are unaffected: they reach the model through
 * the system prompt, which reads `content` and never touches a vector.
 */

/**
 * Similarity floor. Vector search always returns its top-K, however unrelated —
 * ask about Kubernetes in an org whose only memory is a lunch preference and
 * you still get the lunch preference back, which invites the model to weave it
 * into an answer. This drops the obviously-unrelated tail.
 *
 * 0.2 is a floor, not a relevance bar: with `text-embedding-3-small`, unrelated
 * sentences land around 0.0–0.25 and related ones from ~0.3 up. Set it higher
 * and real hits start disappearing; the `limit` is what actually keeps the
 * result set tight.
 */
export const MIN_SCORE = 0.2;

/**
 * The index filters on `orgId`, but scope filtering happens *after* retrieval
 * (another agent's rows, another channel's rows). Ask for more candidates than
 * we intend to return so a handful of invisible rows in the top-K doesn't
 * silently shrink the answer.
 */
const OVERFETCH_FACTOR = 4;
const MAX_CANDIDATES = 100;
const DEFAULT_LIMIT = 10;

export const MemorySearchHitModel = v.object({
	_id: v.id("memory"),
	content: v.string(),
	scope: MemoryScopeModel,
	alwaysOn: v.boolean(),
	score: v.number(),
});

export type MemorySearchHit = Infer<typeof MemorySearchHitModel>;

const search = internalAction({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		threadId: v.id("threads"),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	returns: v.array(MemorySearchHitModel),
	// The return type is annotated rather than inferred: the handler reaches back
	// into `internal.*`, which includes this very action, and TypeScript follows
	// that loop straight into a circular-inference error.
	handler: async (ctx, args): Promise<MemorySearchHit[]> => {
		const query = args.query.trim();
		if (query.length === 0) throw new Error("query cannot be empty");
		const limit = args.limit ?? DEFAULT_LIMIT;

		const { embeddings } = await embedMany(ctx, {
			// Usage-handler context, not retrieval scoping — a search isn't owned by
			// a chat thread any more than a memory row is. See F-07.
			userId: undefined,
			threadId: undefined,
			values: [query],
			embeddingModel: resolveEmbeddingModel(),
		});
		const vector = embeddings[0];
		if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
			throw new Error(
				`memory.search: expected a ${EMBEDDING_DIMENSIONS}-dim query vector, got ${vector?.length ?? 0}`,
			);
		}

		const candidates = await ctx.vectorSearch("memory", "by_embedding", {
			vector,
			limit: Math.min(limit * OVERFETCH_FACTOR, MAX_CANDIDATES),
			filter: (q) => q.eq("orgId", args.orgId),
		});
		const relevant = candidates.filter((c) => c._score >= MIN_SCORE);
		if (relevant.length === 0) return [];

		const rows: Memory[] = await ctx.runQuery(
			internal.memory.queries.listVisibleByIdsInternal.default,
			{
				orgId: args.orgId,
				agentId: args.agentId,
				threadId: args.threadId,
				ids: relevant.map((c) => c._id),
			},
		);

		const scoreById = new Map(relevant.map((c) => [c._id, c._score]));
		return rows
			.map((row) => ({
				_id: row._id,
				content: row.content,
				scope: row.scope,
				alwaysOn: row.alwaysOn,
				score: scoreById.get(row._id) ?? 0,
			}))
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	},
});

export default search;
