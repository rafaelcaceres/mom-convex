import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { AgentRepository } from "../adapters/agent.repository";
import { NewAgentModel } from "../domain/agent.model";

/**
 * Create an agent in the given org.
 *
 * Authz note (M1-T01): requires an authenticated identity but does **not** yet
 * check that the caller is a member of `orgId`. That guard lands in M0-T05's
 * full wiring / M1-T11 (webChat mutations) where `checkMemberPermission` plugs
 * in via `@djpanda/convex-tenants`.
 *
 * Policy: the first agent in an org is marked `isDefault: true`; subsequent
 * agents default to `false`. Slug must be unique per org.
 */
const createAgent = mutation({
	args: {
		...NewAgentModel.pick("orgId", "slug", "name", "systemPrompt", "modelId", "modelProvider")
			.fields,
		toolsAllowlist: v.optional(v.array(v.string())),
	},
	returns: v.id("agents"),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);

		// Uniqueness guard (slug per org)
		const existing = await AgentRepository.byOrgSlug(ctx, {
			orgId: args.orgId,
			slug: args.slug,
		});
		if (existing) {
			throw new Error(`Agent with slug '${args.slug}' already exists in org '${args.orgId}'.`);
		}

		// First agent in an org becomes the default.
		const defaultAgent = await AgentRepository.findDefault(ctx, { orgId: args.orgId });
		const isDefault = defaultAgent === null;

		const agg = await AgentRepository.create(ctx, {
			orgId: args.orgId,
			slug: args.slug,
			name: args.name,
			systemPrompt: args.systemPrompt,
			modelId: args.modelId,
			modelProvider: args.modelProvider,
			isDefault,
			toolsAllowlist: args.toolsAllowlist ?? [],
		});
		return agg.getModel()._id;
	},
});

export default createAgent;
