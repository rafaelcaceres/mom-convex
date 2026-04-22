import { defineTable } from "convex/server";
import { NewMemoryModel } from "./domain/memory.model";

/**
 * Memory rows are partitioned by `scope` + tenant. `by_org_scope` is the
 * workhorse — both `listForAgent` and `listForThread` split the query into
 * per-scope calls on this index, then filter `agentId` / `threadId` in memory
 * (bounded by `MAX_MEMORIES_PER_SCOPE` in the repo).
 *
 * `by_agent` and `by_thread` are cheap maintenance indexes: they let us
 * cascade-delete a thread's memories when it's reset (M1-T-reset already
 * exists for threads) or clean up an agent's memories on delete — without
 * scanning the whole org.
 *
 * `by_embedding` is the vector index M3-T04 will consume via
 * `ctx.vectorSearch("memory", "by_embedding", {...})`. We declare the
 * `orgId` filterField now so cross-tenant isolation (M3-T05) can be done on
 * the index side instead of post-filtering. Dimensions=1536 matches
 * OpenAI `text-embedding-3-small`, which is what `embedMany` from
 * `@convex-dev/agent` defaults to today.
 */
export const memoryTables = {
	memory: defineTable(NewMemoryModel.fields)
		.index("by_org_scope", ["orgId", "scope"])
		.index("by_agent", ["agentId"])
		.index("by_thread", ["threadId"])
		.vectorIndex("by_embedding", {
			vectorField: "embedding",
			dimensions: 1536,
			filterFields: ["orgId"],
		}),
};
