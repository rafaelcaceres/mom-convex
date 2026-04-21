import { createRepository } from "../../_shared/_libs/repository";
import { SlackEventDedupeAgg } from "../domain/slackEventDedupe.model";
import type {
	ISlackEventDedupeRepository,
	RecordResult,
} from "../domain/slackEventDedupe.repository";

export const SlackEventDedupeRepository: ISlackEventDedupeRepository = {
	...createRepository("slackEventDedupe", (doc) => new SlackEventDedupeAgg(doc)),

	getByEventId: async (ctx, { eventId }) => {
		const doc = await ctx.db
			.query("slackEventDedupe")
			.withIndex("by_eventId", (q) => q.eq("eventId", eventId))
			.unique();
		if (!doc) return null;
		return new SlackEventDedupeAgg(doc);
	},

	recordOrSkip: async (ctx, { eventId, now }): Promise<RecordResult> => {
		const existing = await ctx.db
			.query("slackEventDedupe")
			.withIndex("by_eventId", (q) => q.eq("eventId", eventId))
			.unique();
		if (existing) return "duplicate";
		await ctx.db.insert("slackEventDedupe", { eventId, seenAt: now });
		return "recorded";
	},

	clearExpired: async (ctx, { now, ttlMs, batchSize = 500 }): Promise<number> => {
		const cutoff = now - ttlMs;
		let deleted = 0;
		// Process in bounded batches so we stay inside Convex mutation limits.
		// Caller re-invokes if more remain (returns count; zero means "nothing").
		const expired = await ctx.db
			.query("slackEventDedupe")
			.withIndex("by_seenAt", (q) => q.lt("seenAt", cutoff))
			.take(batchSize);
		for (const row of expired) {
			await ctx.db.delete(row._id);
			deleted += 1;
		}
		return deleted;
	},
};
