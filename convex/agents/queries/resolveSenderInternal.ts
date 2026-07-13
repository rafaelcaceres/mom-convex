import { type Infer, v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../customFunctions";
import { SlackInstallRepository } from "../../slack/adapters/slackInstall.repository";
import { SlackUserCacheRepository } from "../../slack/adapters/slackUserCache.repository";
import { AdapterBindingModel } from "../../threads/domain/thread.model";
import { UserRepository } from "../../users/adapters/user.repository";

/**
 * Resolve the *current sender* of a turn into a human-readable profile so the
 * agent knows who it's talking to (M-?? identity hydration).
 *
 * The `senderId` stored on each user message is polymorphic by platform:
 *   - Slack → a Slack user id (`U…`). Resolved via the workspace install
 *     (`installId → teamId`) and the `slackUserCache` directory.
 *   - Web   → an `Id<"users">` from Convex Auth. Resolved via `UserRepository`.
 *   - Event → no human sender; always null.
 *
 * Returns `null` (never throws) when the sender can't be resolved — a missing
 * senderId, an unsynced Slack cache, or a deleted user. The caller treats null
 * as "anonymous turn" and simply omits the identity block from the prompt.
 */

export const SenderProfileModel = v.object({
	id: v.string(),
	name: v.string(),
	handle: v.optional(v.string()),
	platform: v.union(v.literal("slack"), v.literal("web")),
	isBot: v.optional(v.boolean()),
	/**
	 * The sender's IANA zone, when we know it (Slack tells us; web doesn't yet).
	 * Reaches the model through the `## Current Time` block so "todo dia às 9h"
	 * becomes a cron in *their* morning rather than in UTC's.
	 */
	timezone: v.optional(v.string()),
});

export type SenderProfile = Infer<typeof SenderProfileModel>;

const resolveSenderInternal = internalQuery({
	args: {
		binding: AdapterBindingModel,
		senderId: v.optional(v.string()),
	},
	returns: v.union(SenderProfileModel, v.null()),
	handler: async (ctx, args): Promise<SenderProfile | null> => {
		const { binding, senderId } = args;
		if (!senderId) return null;

		if (binding.type === "slack") {
			const install = await SlackInstallRepository.get(
				ctx,
				binding.installId as Id<"slackInstalls">,
			);
			if (!install) return null;
			const cached = await SlackUserCacheRepository.getByTeamUser(ctx, {
				teamId: install.getModel().teamId,
				userId: senderId,
			});
			if (!cached) return null;
			const m = cached.getModel();
			return {
				id: m.userId,
				name: m.displayName,
				handle: m.username,
				platform: "slack",
				isBot: m.isBot,
				timezone: m.tz,
			};
		}

		if (binding.type === "web") {
			const user = await UserRepository.get(ctx, senderId as Id<"users">);
			if (!user) return null;
			return {
				id: senderId,
				name: user.displayName(),
				handle: user.getModel().email,
				platform: "web",
			};
		}

		return null;
	},
});

export default resolveSenderInternal;
