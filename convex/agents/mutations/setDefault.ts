import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { AgentRepository } from "../adapters/agent.repository";

/**
 * Promote an agent to `isDefault: true`, demoting the previous default (if any)
 * in the same org. Idempotent: calling on an already-default agent is a no-op.
 */
const setDefault = mutation({
	args: { agentId: v.id("agents") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);

		const target = await AgentRepository.get(ctx, args.agentId);
		if (!target) {
			throw new Error(`Agent '${args.agentId}' not found.`);
		}
		if (target.getModel().isDefault) return null;

		const current = await AgentRepository.findDefault(ctx, {
			orgId: target.getModel().orgId,
		});
		if (current) {
			current.unmarkDefault();
			await AgentRepository.save(ctx, current);
		}

		target.markAsDefault();
		await AgentRepository.save(ctx, target);
		return null;
	},
});

export default setDefault;
