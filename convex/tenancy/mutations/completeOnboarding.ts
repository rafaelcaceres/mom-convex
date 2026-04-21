import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { requireIdentity } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { tenants } from "../../tenants";

/**
 * One-shot signup: create an org the caller owns AND seed a default agent
 * so they land on `/chat` with something to talk to. Idempotent — if the
 * caller already belongs to an org, returns that org's id instead of
 * creating another.
 *
 * `createOrganization` on the Tenants class covers org creation + member
 * assignment (via `creatorRole: "owner"`) in a single transaction.
 */
const completeOnboarding = mutation({
	args: { orgName: v.string() },
	returns: v.object({
		orgId: v.string(),
		created: v.boolean(),
	}),
	handler: async (ctx, args): Promise<{ orgId: string; created: boolean }> => {
		await requireIdentity(ctx);
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Authentication required");

		const existing = await tenants.listOrganizations(ctx, userId);
		if (existing.length > 0) {
			const first = existing[0];
			if (!first) throw new Error("unreachable");
			return { orgId: first._id, created: false };
		}

		const name = args.orgName.trim();
		if (!name) throw new Error("Organization name is required");

		const orgId = await tenants.createOrganization(ctx, userId, name);

		await AgentRepository.create(ctx, {
			orgId,
			slug: "default",
			name: "Mom",
			systemPrompt: "You are mom, a helpful assistant.",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
			isDefault: true,
			toolsAllowlist: [],
		});

		return { orgId, created: true };
	},
});

export default completeOnboarding;
