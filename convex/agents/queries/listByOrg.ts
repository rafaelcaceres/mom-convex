import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { AgentRepository } from "../adapters/agent.repository";
import { AgentModel } from "../domain/agent.model";

const listByOrg = query({
	args: { orgId: v.string() },
	returns: v.array(AgentModel),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const aggs = await AgentRepository.listByOrg(ctx, { orgId: args.orgId });
		return aggs.map((a) => a.getModel());
	},
});

export default listByOrg;
