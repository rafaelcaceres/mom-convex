import { v } from "convex/values";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { requireOrgRole } from "../../auth.utils";
import { query } from "../../customFunctions";
import { AgentSkillRepository } from "../adapters/agentSkill.repository";
import { SkillCatalogRepository } from "../adapters/skillCatalog.repository";

/**
 * Joins the enabled catalog against an agent's bindings so the /agents/[id]/edit
 * UI can render one row per catalog entry with its current toggle state.
 *
 * Catalog entries with `enabled: false` are withdrawn skills and should not be
 * surfaced in the toggle list (they can't be enabled via `toggleSkill` anyway).
 */
const listCatalogWithBindings = query({
	args: { agentId: v.id("agents") },
	returns: v.array(
		v.object({
			skillKey: v.string(),
			name: v.string(),
			description: v.string(),
			sideEffect: v.union(v.literal("read"), v.literal("write")),
			enabled: v.boolean(),
		}),
	),
	handler: async (ctx, args) => {
		const agent = await AgentRepository.get(ctx, args.agentId);
		if (!agent) return [];
		const orgId = agent.getModel().orgId;
		await requireOrgRole(ctx, orgId, "member");

		const [catalog, bindings] = await Promise.all([
			SkillCatalogRepository.list(ctx),
			AgentSkillRepository.listAllForAgent(ctx, { agentId: args.agentId }),
		]);

		const enabledByKey = new Map<string, boolean>();
		for (const b of bindings) {
			const model = b.getModel();
			enabledByKey.set(model.skillKey, model.enabled);
		}

		return catalog
			.map((c) => {
				const entry = c.getModel();
				return {
					skillKey: entry.key,
					name: entry.name,
					description: entry.description,
					sideEffect: entry.sideEffect,
					enabled: enabledByKey.get(entry.key) ?? false,
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	},
});

export default listCatalogWithBindings;
