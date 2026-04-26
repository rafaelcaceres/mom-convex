import { createRepository } from "../../_shared/_libs/repository";
import { SlackUserCacheAgg } from "../domain/slackUserCache.model";
import type { ISlackUserCacheRepository } from "../domain/slackUserCache.repository";

export const SlackUserCacheRepository: ISlackUserCacheRepository = {
	...createRepository("slackUserCache", (doc) => new SlackUserCacheAgg(doc)),

	getByTeamUser: async (ctx, { teamId, userId }) => {
		const doc = await ctx.db
			.query("slackUserCache")
			.withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
			.unique();
		if (!doc) return null;
		return new SlackUserCacheAgg(doc);
	},

	listByTeam: async (ctx, { teamId }) => {
		const docs = await ctx.db
			.query("slackUserCache")
			.withIndex("by_team", (q) => q.eq("teamId", teamId))
			.collect();
		return docs.map((doc) => new SlackUserCacheAgg(doc));
	},

	upsertByTeamUser: async (ctx, data) => {
		const existing = await ctx.db
			.query("slackUserCache")
			.withIndex("by_team_user", (q) =>
				q.eq("teamId", data.teamId).eq("userId", data.userId),
			)
			.unique();
		if (existing) {
			await ctx.db.replace(existing._id, data);
			const reloaded = await ctx.db.get(existing._id);
			if (!reloaded) throw new Error("Failed to reload slackUserCache after upsert");
			return new SlackUserCacheAgg(reloaded);
		}
		const id = await ctx.db.insert("slackUserCache", data);
		const doc = await ctx.db.get(id);
		if (!doc) throw new Error("Failed to create slackUserCache");
		return new SlackUserCacheAgg(doc);
	},
};
