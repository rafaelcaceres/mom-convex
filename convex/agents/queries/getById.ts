import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { AgentRepository } from "../adapters/agent.repository";
import { AgentModel } from "../domain/agent.model";

const getById = query({
	args: { agentId: v.id("agents") },
	returns: v.union(AgentModel, v.null()),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const agg = await AgentRepository.get(ctx, args.agentId);
		return agg?.getModel() ?? null;
	},
});

export default getById;
