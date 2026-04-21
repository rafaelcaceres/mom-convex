import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { AgentRepository } from "../adapters/agent.repository";
import { AgentModel } from "../domain/agent.model";

/**
 * Internal sibling of `getById` — same lookup, no auth guard. Used by the
 * agentRunner action to load the agent config (modelId, systemPrompt, …)
 * when building the cached Agent instance via `agentFactory`.
 */
const getByIdInternal = internalQuery({
	args: { agentId: v.id("agents") },
	returns: v.union(AgentModel, v.null()),
	handler: async (ctx, args) => {
		const agg = await AgentRepository.get(ctx, args.agentId);
		return agg?.getModel() ?? null;
	},
});

export default getByIdInternal;
