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
}
