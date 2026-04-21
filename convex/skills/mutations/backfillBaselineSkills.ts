import { v } from "convex/values";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { internalMutation } from "../../customFunctions";
import { BASELINE_SKILL_KEYS, seedBaselineSkillsForAgentId } from "../_triggers";
import { AgentSkillRepository } from "../adapters/agentSkill.repository";
import { SkillCatalogRepository } from "../adapters/skillCatalog.repository";

/**
 * One-shot backfill for agents created before the baseline-seeding trigger
 * existed (pre-M2-T03). Idempotent — re-running leaves bindings unchanged.
 *
 * Run via:
 *   convex run skills/mutations/backfillBaselineSkills:default \
 *     '{"agentId":"<id>"}'                      // baseline only (default)
 *   convex run skills/mutations/backfillBaselineSkills:default \
 *     '{"agentId":"<id>","mode":"all"}'         // every enabled catalog entry
 *
 * `"all"` mode is dev-only ergonomics: it hands the agent *write* skills
 * (e.g. `sandbox.bash`) that should normally go through `toggleSkill` with
 * admin intent. Don't use in production without thinking twice.
 *
 * Internal-only — exposing publicly would let any logged-in user reset
 * another org's bindings.
 */
const backfillBaselineSkills = internalMutation({
	args: {
		agentId: v.id("agents"),
		mode: v.optional(v.union(v.literal("baseline"), v.literal("all"))),
	},
	returns: v.object({
		agentId: v.id("agents"),
		orgId: v.string(),
		seeded: v.array(v.string()),
	}),
	handler: async (ctx, args) => {
		const agentAgg = await AgentRepository.get(ctx, args.agentId);
		if (!agentAgg) throw new Error(`Agent not found: ${args.agentId}`);
		const agent = agentAgg.getModel();

		const mode = args.mode ?? "baseline";

		if (mode === "baseline") {
			const seeded = await seedBaselineSkillsForAgentId(ctx, {
				orgId: agent.orgId,
				agentId: agent._id,
			});
			return { agentId: agent._id, orgId: agent.orgId, seeded };
		}

		// "all" — enable every catalog entry currently marked enabled.
		const catalog = await SkillCatalogRepository.list(ctx);
		const seeded: string[] = [];
		for (const entry of catalog) {
			const { key } = entry.getModel();
			await AgentSkillRepository.enable(ctx, {
				orgId: agent.orgId,
				agentId: agent._id,
				skillKey: key,
			});
			seeded.push(key);
		}
		return { agentId: agent._id, orgId: agent.orgId, seeded };
	},
});

// Re-export for callers that want the constant in their own scripts.
export { BASELINE_SKILL_KEYS };

export default backfillBaselineSkills;
