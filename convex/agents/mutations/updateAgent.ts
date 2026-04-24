import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { SUPPORTED_MODELS, isSupportedModel } from "../_libs/supportedModels";
import { AgentRepository } from "../adapters/agent.repository";

/**
 * Admin-only patch of an agent's editable fields. Used by /agents/[id]/edit.
 *
 * Keeps `updateSystemPrompt` as-is — a few internal call-sites still use it
 * with member-level auth, and splitting UX flows vs. programmatic updates is
 * cheaper than reconciling the two. For UI edits, this is the one entrypoint.
 *
 * `modelId` is validated against `SUPPORTED_MODELS`: the dropdown only ships
 * known models, but an attacker bypassing the UI would otherwise quietly
 * switch the agent to an unpriced id and every turn would zero-price in the
 * cost ledger. The provider is derived from the catalog, not trusted from
 * the client — keeps the (modelId, provider) pair consistent.
 */
const updateAgent = mutation({
	args: {
		agentId: v.id("agents"),
		systemPrompt: v.optional(v.string()),
		modelId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const agg = await AgentRepository.get(ctx, args.agentId);
		if (!agg) throw new Error("Agent not found");
		const agent = agg.getModel();

		await requireOrgRole(ctx, agent.orgId, "admin");

		if (args.systemPrompt !== undefined) {
			agg.updateSystemPrompt(args.systemPrompt);
		}

		if (args.modelId !== undefined) {
			if (!isSupportedModel(args.modelId)) {
				throw new Error(`Unsupported model '${args.modelId}'`);
			}
			const entry = SUPPORTED_MODELS.find((m) => m.modelId === args.modelId);
			if (!entry) throw new Error("unreachable");
			agg.updateModel({ modelId: entry.modelId, modelProvider: entry.provider });
		}

		await AgentRepository.save(ctx, agg);
		return null;
	},
});

export default updateAgent;
