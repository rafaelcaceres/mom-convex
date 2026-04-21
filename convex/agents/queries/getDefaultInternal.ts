import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { AgentRepository } from "../adapters/agent.repository";
import { AgentModel } from "../domain/agent.model";

/**
 * Internal sibling of `getDefault` — same lookup, no auth guard.
 * Used by slack `handleIncomingEvent` (an internal action triggered by
 * Slack's signed webhook, not a logged-in user).
 */
const getDefaultInternal = internalQuery({
	args: { orgId: v.string() },
	returns: v.union(AgentModel, v.null()),
	handler: async (ctx, args) => {
		const agg = await AgentRepository.findDefault(ctx, { orgId: args.orgId });
		return agg?.getModel() ?? null;
	},
});

export default getDefaultInternal;
