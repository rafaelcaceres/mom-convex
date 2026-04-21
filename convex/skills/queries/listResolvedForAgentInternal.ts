import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { AgentSkillRepository } from "../adapters/agentSkill.repository";
import { SkillCatalogRepository } from "../adapters/skillCatalog.repository";

/**
 * Server-side join of enabled `agentSkills` × `skillCatalog` for a given agent.
 * Used by `resolveTools` (M2-T04) — exposed as an internalQuery so actions
 * can load the tool set via `ctx.runQuery` in a single round-trip.
 *
 * Catalog entries that are disabled (or missing) are filtered out: a stale
 * binding to a withdrawn skill should not materialize a tool for the model.
 */
const listResolvedForAgentInternal = internalQuery({
	args: { agentId: v.id("agents") },
	returns: v.array(
		v.object({
			skillKey: v.string(),
			name: v.string(),
			description: v.string(),
			zodSchemaJson: v.string(),
			sideEffect: v.union(v.literal("read"), v.literal("write")),
			config: v.optional(v.any()),
		}),
	),
	handler: async (ctx, args) => {
		const bindings = await AgentSkillRepository.listForAgent(ctx, { agentId: args.agentId });
		const resolved = [];
		for (const b of bindings) {
			const binding = b.getModel();
			const catalog = await SkillCatalogRepository.getByKey(ctx, { key: binding.skillKey });
			if (!catalog) continue;
			const entry = catalog.getModel();
			if (!entry.enabled) continue;
			resolved.push({
				skillKey: entry.key,
				name: entry.name,
				description: entry.description,
				zodSchemaJson: entry.zodSchemaJson,
				sideEffect: entry.sideEffect,
				config: binding.config,
			});
		}
		return resolved;
	},
});

export default listResolvedForAgentInternal;
