import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Dedupe ledger for Slack event callbacks. Slack retries delivery whenever
 * our httpAction doesn't 200 within 3 seconds, so we record every `event_id`
 * we've processed and short-circuit repeats. Rows are garbage-collected
 * hourly by `cleanExpiredDedupe` (default TTL 24h, safely above Slack's
 * retry window).
 */

export const NewSlackEventDedupeModel = v.object({
	eventId: v.string(),
	seenAt: v.number(),
});

export const SlackEventDedupeModel = v.object({
	_id: v.id("slackEventDedupe"),
	_creationTime: v.number(),
	...NewSlackEventDedupeModel.fields,
});

export type NewSlackEventDedupe = Infer<typeof NewSlackEventDedupeModel>;
export type SlackEventDedupe = Infer<typeof SlackEventDedupeModel>;

export const DEFAULT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

export class SlackEventDedupeAgg implements IAggregate<SlackEventDedupe> {
	constructor(private readonly entry: SlackEventDedupe) {}

	getModel(): SlackEventDedupe {
		return this.entry;
	}

	isExpired(now: number, ttlMs: number = DEFAULT_DEDUPE_TTL_MS): boolean {
		return this.entry.seenAt < now - ttlMs;
	}
}
