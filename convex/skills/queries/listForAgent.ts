import { v } from "convex/values";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { AgentSkillRepository } from "../adapters/agentSkill.repository";

/**
 * List the enabled skill bindings for an agent. Used by `resolveTools`
 * (M2-T04) and by the /agents/[id]/edit UI (M2-T17).
 *
 * Authz is coarse for now (any authenticated caller can read); tightening
 * to "member of the agent's org" lands alongside the UI wiring that
 * exposes it.
 */
const listForAgent = query({
	args: { agentId: v.id("agents") },
	returns: v.array(
		v.object({
			_id: v.id("agentSkills"),
			_creationTime: v.number(),
			orgId: v.string(),
			agentId: v.id("agents"),
			skillKey: v.string(),
			enabled: v.boolean(),
			config: v.optional(v.any()),
		}),
	),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const agent = await AgentRepository.get(ctx, args.agentId);
		if (!agent) return [];
		const bindings = await AgentSkillRepository.listForAgent(ctx, { agentId: args.agentId });
		return bindings.map((b) => b.getModel());
	},
});

export default listForAgent;
