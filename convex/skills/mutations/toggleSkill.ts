import { v } from "convex/values";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { AgentSkillRepository } from "../adapters/agentSkill.repository";
import { SkillCatalogRepository } from "../adapters/skillCatalog.repository";

/**
 * Admin-only toggle of a skill binding on an agent.
 *
 * Guards:
 *  - auth required (`requireOrgRole` throws `"Authentication required"` when
 *    no session is present);
 *  - caller must have ≥admin role in the agent's org;
 *  - skill key must exist in `skillCatalog` and be `enabled: true` — a
 *    disabled catalog row is treated as "withdrawn", even for existing bindings.
 */
const toggleSkill = mutation({
	args: {
		agentId: v.id("agents"),
		skillKey: v.string(),
		action: v.union(v.literal("enable"), v.literal("disable")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const agentAgg = await AgentRepository.get(ctx, args.agentId);
		if (!agentAgg) throw new Error("Agent not found");
		const agent = agentAgg.getModel();

		await requireOrgRole(ctx, agent.orgId, "admin");

		const catalog = await SkillCatalogRepository.getByKey(ctx, { key: args.skillKey });
		if (!catalog) throw new Error(`Unknown skill '${args.skillKey}'`);
		if (!catalog.getModel().enabled) {
			throw new Error(`Skill '${args.skillKey}' is disabled in catalog`);
		}

		if (args.action === "enable") {
			await AgentSkillRepository.enable(ctx, {
				orgId: agent.orgId,
				agentId: agent._id,
				skillKey: args.skillKey,
			});
		} else {
			await AgentSkillRepository.disable(ctx, {
				agentId: agent._id,
				skillKey: args.skillKey,
			});
		}
		return null;
	},
});

export default toggleSkill;
