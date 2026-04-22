import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { query } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { MemoryRepository } from "../adapters/memory.repository";
import { MemoryModel } from "../domain/memory.model";

/**
 * Full memory set visible to a single turn: org + agent + thread scopes.
 *
 * `threadId` alone identifies the (agent, org) tuple — we derive them from
 * the thread doc to avoid trusting client-passed args. Caller just needs
 * `member` role in the owning org.
 */
const listForThread = query({
	args: { threadId: v.id("threads") },
	returns: v.array(MemoryModel),
	handler: async (ctx, args) => {
		const thread = await ThreadRepository.get(ctx, args.threadId);
		if (!thread) return [];
		const { orgId, agentId } = thread.getModel();
		await requireOrgRole(ctx, orgId, "member");
		const rows = await MemoryRepository.listForThread(ctx, {
			orgId,
			agentId,
			threadId: args.threadId,
		});
		return rows.map((r) => r.getModel());
	},
});

export default listForThread;
