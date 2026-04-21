import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { AgentRepository } from "../adapters/agent.repository";
import { AgentModel } from "../domain/agent.model";

const getDefault = query({
	args: { orgId: v.string() },
	returns: v.union(AgentModel, v.null()),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const agg = await AgentRepository.findDefault(ctx, { orgId: args.orgId });
		return agg?.getModel() ?? null;
	},
});

export default getDefault;
