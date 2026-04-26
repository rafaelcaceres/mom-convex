import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { SlackUserCacheRepository } from "../adapters/slackUserCache.repository";

/**
 * Bulk read every cached user for a Slack workspace. Used by the agent
 * runner to hydrate the in-memory `SlackUserCache` map at the start of a
 * turn so `<@U…>` mentions resolve to human-readable handles. Returns an
 * empty array when the cache hasn't been synced yet for this team.
 */
const getUsersByTeam = internalQuery({
	args: { teamId: v.string() },
	returns: v.array(
		v.object({
			userId: v.string(),
			username: v.string(),
			displayName: v.string(),
			isBot: v.boolean(),
		}),
	),
	handler: async (ctx, args) => {
		const aggs = await SlackUserCacheRepository.listByTeam(ctx, { teamId: args.teamId });
		return aggs.map((agg) => {
			const m = agg.getModel();
			return {
				userId: m.userId,
				username: m.username,
				displayName: m.displayName,
				isBot: m.isBot,
			};
		});
	},
});

export default getUsersByTeam;
