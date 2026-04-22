import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { query } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { MemoryRepository } from "../adapters/memory.repository";
import { MemoryModel } from "../domain/memory.model";

/**
 * Always-on subset of the thread-visible memory set — the rows that the
 * system-prompt builder (M2-T09) will concatenate at turn time.
 *
 * User-facing variant for the /agents/[id]/edit UI so admins can preview
 * what's actually pinned into the prompt. M2-T09's internal action runs
 * via `listAlwaysOnInternal` to skip the identity hop from system-driven
 * events.
 */
const listAlwaysOn = query({
	args: { threadId: v.id("threads") },
	returns: v.array(MemoryModel),
	handler: async (ctx, args) => {
		const thread = await ThreadRepository.get(ctx, args.threadId);
		if (!thread) return [];
		const { orgId, agentId } = thread.getModel();
		await requireOrgRole(ctx, orgId, "member");
		const rows = await MemoryRepository.listAlwaysOn(ctx, {
			orgId,
			agentId,
			threadId: args.threadId,
		});
		return rows.map((r) => r.getModel());
	},
});

export default listAlwaysOn;
