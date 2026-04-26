import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { SUPPORTED_MODELS, isSupportedModel } from "../_libs/supportedModels";
import { AgentRepository } from "../adapters/agent.repository";

/**
 * Member-level mutation that swaps the agent's `modelId` (and derived
 * `modelProvider`) from an in-chat picker — the ChatGPT/Claude/Manus
 * pattern where the user changes model without leaving the conversation.
 *
 * Distinct from `updateAgent` (admin-only, edits prompt + skills + model
 * together for /agents/[id]/edit). Splitting the auth surface is
 * intentional: prompt/skills changes affect the agent's behavior in ways
 * a non-admin shouldn't toggle, but model swap is just spend + UX
 * preference and any org member should be able to flip it.
 *
 * `modelId` is validated against `SUPPORTED_MODELS` so an attacker
 * bypassing the dropdown can't switch the agent to an unpriced id and
 * silently zero-price every turn in the cost ledger. Provider is
 * derived from the catalog so the (modelId, provider) pair stays
 * consistent.
 */
const setAgentModel = mutation({
	args: {
		agentId: v.id("agents"),
		modelId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const agg = await AgentRepository.get(ctx, args.agentId);
		if (!agg) throw new Error("Agent not found");
		const agent = agg.getModel();

		await requireOrgRole(ctx, agent.orgId, "member");

		if (!isSupportedModel(args.modelId)) {
			throw new Error(`Unsupported model '${args.modelId}'`);
		}
		const entry = SUPPORTED_MODELS.find((m) => m.modelId === args.modelId);
		if (!entry) throw new Error("unreachable");

		agg.updateModel({ modelId: entry.modelId, modelProvider: entry.provider });
		await AgentRepository.save(ctx, agg);
		return null;
	},
});

export default setAgentModel;
