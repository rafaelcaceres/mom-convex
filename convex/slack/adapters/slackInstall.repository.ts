import { createRepository } from "../../_shared/_libs/repository";
import { SlackInstallAgg } from "../domain/slackInstall.model";
import type { ISlackInstallRepository } from "../domain/slackInstall.repository";

export const SlackInstallRepository: ISlackInstallRepository = {
	...createRepository("slackInstalls", (doc) => new SlackInstallAgg(doc)),

	getByTeamId: async (ctx, { teamId }) => {
		const doc = await ctx.db
			.query("slackInstalls")
			.withIndex("by_teamId", (q) => q.eq("teamId", teamId))
			.unique();
		if (!doc) return null;
		return new SlackInstallAgg(doc);
	},

	listByOrg: async (ctx, { orgId }) => {
		const docs = await ctx.db
			.query("slackInstalls")
			.withIndex("by_org", (q) => q.eq("orgId", orgId))
			.collect();
		return docs.map((doc) => new SlackInstallAgg(doc));
	},

	upsertByTeamId: async (ctx, data) => {
		const existing = await ctx.db
			.query("slackInstalls")
			.withIndex("by_teamId", (q) => q.eq("teamId", data.teamId))
			.unique();
		if (existing) {
			await ctx.db.replace(existing._id, data);
			const reloaded = await ctx.db.get(existing._id);
			if (!reloaded) throw new Error("Failed to reload slackInstall after upsert");
			return new SlackInstallAgg(reloaded);
		}
		const id = await ctx.db.insert("slackInstalls", data);
		const doc = await ctx.db.get(id);
		if (!doc) throw new Error("Failed to create slackInstall");
		return new SlackInstallAgg(doc);
	},
};
