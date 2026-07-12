import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Durable memory separate from message history. Four scopes share the table:
 *
 *  - `org`     — fact visible to every agent + thread in the org.
 *  - `agent`   — fact tied to a specific agent (e.g. persona override).
 *  - `channel` — fact shared by every thread in one platform channel.
 *  - `thread`  — fact tied to a single conversation.
 *
 * **Why `channel` exists.** In Slack, each *message thread* is its own `threads`
 * row, and threads are short-lived. A bot that only remembers per-thread forgets
 * everything the moment the conversation moves; a bot that remembers per-org
 * leaks one team's context into another's. The channel is the unit people
 * actually treat as a shared room: what the bot learns in `#eng` should hold
 * across `#eng` threads and stay out of `#sales`. `channelKey` is the canonical
 * identity of that room, derived from the thread's binding
 * (`channelKeyFromBinding` in the `threads` domain) — `slack:<installId>:<channelId>`.
 * Platforms without a room concept (web chat, scheduled events) have no
 * channelKey; the web binding is already one thread per user, so `thread` scope
 * covers that case.
 *
 * `alwaysOn: true` rows are concatenated into the system prompt at turn time
 * (wired in M2-T09). `alwaysOn: false` rows live only for semantic retrieval
 * via `ctx.vectorSearch` on the `by_embedding` vector index (M3-T04).
 *
 * `embedding` stays optional because it is filled *asynchronously*: a trigger
 * on this table schedules an action that embeds `content` via `embedMany` from
 * `@convex-dev/agent` and writes the vector back (M3-T02). A row therefore
 * exists — and is readable — for a beat before it is searchable.
 *
 * **Authorship.** Exactly one of `updatedBy` (a human) / `updatedByAgentId` (the
 * agent, writing via the `memory.save` skill) is set. Both are optional in the
 * validator because a union of two shapes buys nothing here, but a row with
 * neither is a bug — the mutations enforce it. The agent is not a Convex user,
 * and minting a synthetic user row for it would poison every "who did this"
 * query downstream.
 *
 * Scope invariants (enforced at the mutation layer — the validator permits an
 * optional field on any scope):
 *  - `scope: "org"`     ⇒ `agentId`, `threadId`, `channelKey` absent.
 *  - `scope: "agent"`   ⇒ `agentId` present; `threadId`, `channelKey` absent.
 *  - `scope: "channel"` ⇒ `channelKey` present; `agentId`, `threadId` absent.
 *  - `scope: "thread"`  ⇒ `agentId` + `threadId` present; `channelKey` absent.
 */

export const MemoryScopeModel = v.union(
	v.literal("org"),
	v.literal("agent"),
	v.literal("channel"),
	v.literal("thread"),
);

export const MAX_MEMORY_CONTENT_CHARS = 8000;

export const NewMemoryModel = v.object({
	orgId: v.string(),
	scope: MemoryScopeModel,
	agentId: v.optional(v.id("agents")),
	threadId: v.optional(v.id("threads")),
	channelKey: v.optional(v.string()),
	content: v.string(),
	alwaysOn: v.boolean(),
	updatedBy: v.optional(v.id("users")),
	updatedByAgentId: v.optional(v.id("agents")),
	updatedAt: v.number(),
	embedding: v.optional(v.array(v.number())),
});

export const MemoryModel = v.object({
	_id: v.id("memory"),
	_creationTime: v.number(),
	...NewMemoryModel.fields,
});

export type MemoryScope = Infer<typeof MemoryScopeModel>;
export type NewMemory = Infer<typeof NewMemoryModel>;
export type Memory = Infer<typeof MemoryModel>;

export class MemoryAgg implements IAggregate<Memory> {
	constructor(private readonly memory: Memory) {}

	getModel(): Memory {
		return this.memory;
	}

	/**
	 * True when this memory applies to the given runtime context. Used by the
	 * system-prompt builder (M2-T09) and `listAlwaysOn` to pick rows that
	 * should be concatenated for a specific turn.
	 *
	 *  - `org`-scoped rows match every context in the org.
	 *  - `agent`-scoped rows match only when `ctx.agentId` equals the memory's
	 *    `agentId`.
	 *  - `channel`-scoped rows match only when `ctx.channelKey` equals the
	 *    memory's `channelKey`. A turn with no channel (web chat, scheduled
	 *    event) matches none — this is the cross-channel isolation boundary,
	 *    so an absent key must never be treated as a wildcard.
	 *  - `thread`-scoped rows match only when `ctx.threadId` equals the
	 *    memory's `threadId`.
	 */
	matchesScope(ctx: {
		agentId?: Memory["agentId"];
		threadId?: Memory["threadId"];
		channelKey?: string;
	}): boolean {
		switch (this.memory.scope) {
			case "org":
				return true;
			case "agent":
				return ctx.agentId !== undefined && this.memory.agentId === ctx.agentId;
			case "channel":
				return ctx.channelKey !== undefined && this.memory.channelKey === ctx.channelKey;
			case "thread":
				return ctx.threadId !== undefined && this.memory.threadId === ctx.threadId;
		}
	}

	updateContent(next: string): void {
		const trimmed = next.trim();
		if (trimmed.length === 0) throw new Error("content cannot be empty");
		if (trimmed.length > MAX_MEMORY_CONTENT_CHARS) {
			throw new Error(`content exceeds ${MAX_MEMORY_CONTENT_CHARS} chars`);
		}
		this.memory.content = trimmed;
	}

	setAlwaysOn(next: boolean): void {
		this.memory.alwaysOn = next;
	}

	/**
	 * Attach the vector for the current `content`. Written only by the
	 * embedding action's compare-and-set mutation (M3-T02) — never by a
	 * user-facing path, because the vector must always correspond to the
	 * content that produced it.
	 */
	setEmbedding(vector: number[]): void {
		this.memory.embedding = vector;
	}

	/**
	 * Record a human edit. Clears any agent authorship: once a person has
	 * revised the row, "the bot wrote this" is no longer true, and leaving both
	 * stamps set would make the audit trail lie in whichever direction the
	 * reader happens to check.
	 */
	touch(updatedBy: NonNullable<Memory["updatedBy"]>, now: number): void {
		this.memory.updatedBy = updatedBy;
		this.memory.updatedByAgentId = undefined;
		this.memory.updatedAt = now;
	}

	/** Record an agent edit (via the `memory.save` skill). Mirror of `touch`. */
	touchByAgent(agentId: NonNullable<Memory["updatedByAgentId"]>, now: number): void {
		this.memory.updatedByAgentId = agentId;
		this.memory.updatedBy = undefined;
		this.memory.updatedAt = now;
	}
}
