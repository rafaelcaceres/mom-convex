import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { AgentRepository } from "../adapters/agent.repository";

const updateSystemPrompt = mutation({
	args: {
		agentId: v.id("agents"),
		systemPrompt: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const agg = await AgentRepository.get(ctx, args.agentId);
		if (!agg) {
			throw new Error(`Agent '${args.agentId}' not found.`);
		}
		agg.updateSystemPrompt(args.systemPrompt);
		await AgentRepository.save(ctx, agg);
		return null;
	},
});

export default updateSystemPrompt;
