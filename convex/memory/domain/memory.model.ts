import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Durable memory separate from message history. Three scopes share the table:
 *
 *  - `org`    — fact visible to every agent + thread in the org.
 *  - `agent`  — fact tied to a specific agent (e.g. persona override).
 *  - `thread` — fact tied to a single conversation.
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
 * Scope invariants (enforced at the mutation layer, not the aggregate — the
 * validator already forbids impossible field combinations via the validator):
 *  - `scope: "org"`    ⇒ `agentId` and `threadId` absent.
 *  - `scope: "agent"`  ⇒ `agentId` present, `threadId` absent.
 *  - `scope: "thread"` ⇒ `agentId` and `threadId` both present.
 */

export const MemoryScopeModel = v.union(v.literal("org"), v.literal("agent"), v.literal("thread"));

export const MAX_MEMORY_CONTENT_CHARS = 8000;

export const NewMemoryModel = v.object({
	orgId: v.string(),
	scope: MemoryScopeModel,
	agentId: v.optional(v.id("agents")),
	threadId: v.optional(v.id("threads")),
	content: v.string(),
	alwaysOn: v.boolean(),
	updatedBy: v.id("users"),
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
	 * should be concatenated for a specific (agent, thread) turn.
	 *
	 *  - `org`-scoped rows match every context in the org.
	 *  - `agent`-scoped rows match only when `ctx.agentId` equals the memory's
	 *    `agentId`.
	 *  - `thread`-scoped rows match only when `ctx.threadId` equals the
	 *    memory's `threadId`.
	 */
	matchesScope(ctx: { agentId?: Memory["agentId"]; threadId?: Memory["threadId"] }): boolean {
		switch (this.memory.scope) {
			case "org":
				return true;
			case "agent":
				return ctx.agentId !== undefined && this.memory.agentId === ctx.agentId;
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

	touch(updatedBy: Memory["updatedBy"], now: number): void {
		this.memory.updatedBy = updatedBy;
		this.memory.updatedAt = now;
	}
}
