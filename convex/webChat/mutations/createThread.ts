import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { createAgentThread } from "../../agents/adapters/threadBridge";
import { requireIdentity } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { bindingKey } from "../../threads/domain/thread.model";

/**
 * Create (or resolve — idempotent) a web chat thread for the caller. If
 * `agentId` is omitted, the org's default agent is used. The userId comes
 * from Convex Auth, not the client, so clients can't forge a binding.
 */
const createThread = mutation({
	args: {
		orgId: v.string(),
		agentId: v.optional(v.id("agents")),
	},
	returns: v.id("threads"),
	handler: async (ctx, args): Promise<Id<"threads">> => {
		await requireIdentity(ctx);
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Authentication required");

		let agentId = args.agentId;
		if (!agentId) {
			const def = await AgentRepository.findDefault(ctx, { orgId: args.orgId });
			if (!def) throw new Error(`No default agent for org '${args.orgId}'`);
			agentId = def.getModel()._id;
		}

		const binding = { type: "web" as const, userId };
		const key = bindingKey(binding);
		const existing = await ThreadRepository.getByOrgBinding(ctx, {
			orgId: args.orgId,
			bindingKey: key,
		});
		if (existing) return existing.getModel()._id;

		const agentThreadId = await createAgentThread(ctx, { userId });

		const agg = await ThreadRepository.create(ctx, {
			orgId: args.orgId,
			agentId,
			agentThreadId,
			binding,
			bindingKey: key,
		});
		return agg.getModel()._id;
	},
});

export default createThread;
