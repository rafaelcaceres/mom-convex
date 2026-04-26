import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { SlackUserCacheRepository } from "../adapters/slackUserCache.repository";

/**
 * Bulk upsert into `slackUserCache`. Called by `slack.actions.syncUsers`
 * after fetching a page of `users.list`. Each row is upserted by
 * `(teamId, userId)` so re-running sync is idempotent and reflects renames
 * without leaving stale duplicates.
 */
const upsertCachedUsers = internalMutation({
	args: {
		orgId: v.string(),
		teamId: v.string(),
		fetchedAt: v.number(),
		users: v.array(
			v.object({
				userId: v.string(),
				username: v.string(),
				displayName: v.string(),
				isBot: v.boolean(),
			}),
		),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		for (const u of args.users) {
			await SlackUserCacheRepository.upsertByTeamUser(ctx, {
				orgId: args.orgId,
				teamId: args.teamId,
				userId: u.userId,
				username: u.username,
				displayName: u.displayName,
				isBot: u.isBot,
				fetchedAt: args.fetchedAt,
			});
		}
		return args.users.length;
	},
});

export default upsertCachedUsers;
