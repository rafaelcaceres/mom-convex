import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { MemoryRepository } from "../adapters/memory.repository";
import { MemoryModel } from "../domain/memory.model";

/**
 * Always-on memories visible to a specific turn. Exposed as an internalQuery
 * so the system-prompt builder (M2-T09 — runs from the agent action) can load
 * them via `ctx.runQuery` without a user-facing auth hop. The builder runs
 * *inside* a turn, so the caller (handleIncoming) has already established the
 * org/agent context.
 */
const listAlwaysOnInternal = internalQuery({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		threadId: v.id("threads"),
	},
	returns: v.array(MemoryModel),
	handler: async (ctx, args) => {
		const rows = await MemoryRepository.listAlwaysOn(ctx, args);
		return rows.map((r) => r.getModel());
	},
});

export default listAlwaysOnInternal;
