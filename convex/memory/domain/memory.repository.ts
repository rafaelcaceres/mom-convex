import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { Memory, MemoryAgg } from "./memory.model";

/**
 * Retrieval API shaped around how the system-prompt builder (M2-T09) and
 * `memory.search` (M3-T04) consume memories:
 *
 *  - Agent-edit UIs need "everything visible to this agent" → `listForAgent`.
 *  - System-prompt builder needs "everything visible to this turn" →
 *    `listForThread` (adds thread-scoped rows on top of agent+org).
 *  - The always-on filter is a subset of `listForThread` so it can be swapped
 *    for a single index later without touching the builder.
 */
export interface IMemoryRepository extends IRepository<"memory", MemoryAgg> {
	/**
	 * Org-wide + agent-scoped rows for `agentId`. Thread-scoped rows are
	 * excluded — they need a specific thread to be meaningful.
	 */
	listForAgent(
		ctx: QueryCtx,
		clause: { orgId: Memory["orgId"]; agentId: NonNullable<Memory["agentId"]> },
	): Promise<MemoryAgg[]>;

	/**
	 * Org-wide + agent-scoped (for `agentId`) + channel-scoped (for
	 * `channelKey`) + thread-scoped (for `threadId`) rows — the full set visible
	 * to a single turn.
	 *
	 * `channelKey` is optional because not every platform has a room (web chat,
	 * scheduled events). When it is absent, NO channel rows are returned — the
	 * caller must not be able to accidentally widen the query into "every
	 * channel in the org" by omitting it.
	 */
	listForThread(
		ctx: QueryCtx,
		clause: {
			orgId: Memory["orgId"];
			agentId: NonNullable<Memory["agentId"]>;
			threadId: NonNullable<Memory["threadId"]>;
			channelKey?: string;
		},
	): Promise<MemoryAgg[]>;

	/**
	 * Same visibility set as `listForThread`, filtered to `alwaysOn: true`.
	 * Powers the system-prompt concatenation in M2-T09.
	 */
	listAlwaysOn(
		ctx: QueryCtx,
		clause: {
			orgId: Memory["orgId"];
			agentId: NonNullable<Memory["agentId"]>;
			threadId: NonNullable<Memory["threadId"]>;
			channelKey?: string;
		},
	): Promise<MemoryAgg[]>;

	/** Channel-scoped rows for one room. Used by the channel memory UI/admin. */
	listForChannel(
		ctx: QueryCtx,
		clause: { orgId: Memory["orgId"]; channelKey: string },
	): Promise<MemoryAgg[]>;

	/**
	 * Hydrate ids returned by `ctx.vectorSearch` on `by_embedding`, keeping only
	 * the rows this turn is actually allowed to see (M3-T04).
	 *
	 * The vector index carries a single filter field, `orgId`, so it can enforce
	 * the tenant boundary and nothing finer. Scope is the rest of the boundary:
	 * an `agent`-scoped row belonging to another agent, or a `channel`-scoped row
	 * from `#sales`, is semantically similar to the query in exactly the same way
	 * a legitimate hit is — similarity is not permission. So the same
	 * `matchesScope` rule that gates the system prompt gates retrieval here, and
	 * `orgId` is re-checked on the row itself rather than trusted from the index.
	 *
	 * Ordering is not preserved: vector rank is the caller's business (it holds
	 * the scores), and a repository that silently reordered by relevance would be
	 * lying about what it does.
	 */
	listVisibleByIds(
		ctx: QueryCtx,
		clause: {
			orgId: Memory["orgId"];
			agentId: NonNullable<Memory["agentId"]>;
			threadId: NonNullable<Memory["threadId"]>;
			channelKey?: string;
			ids: Id<"memory">[];
		},
	): Promise<MemoryAgg[]>;

	/**
	 * Rows with no vector, across every org. Feeds the one-shot backfill
	 * (`backfillEmbeddings`).
	 *
	 * These exist because the embedding trigger (M3-T02) only fires on insert or
	 * a content change: a memory written *before* that trigger shipped will never
	 * be re-embedded on its own — editing it is the only thing that would, and
	 * nobody edits a memory to make it findable. Without this they'd be
	 * permanently invisible to `memory.search`, which is a silent hole rather
	 * than a visible failure.
	 */
	listMissingEmbedding(ctx: QueryCtx, clause: { limit: number }): Promise<MemoryAgg[]>;
}
