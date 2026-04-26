import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * Per-team Slack user directory. Hydrated by `slack.actions.syncUsers`
 * (paginated `users.list`) and refreshed by a daily cron. Lookups by
 * `teamId + userId` resolve `<@U…>` mentions in inbound events to
 * human-readable names so the agent can address users naturally.
 *
 * Records are scoped by `orgId` so the dashboard can show "X users in
 * Y workspace" without leaking across tenants. Deleted Slack users are
 * filtered out on sync — the row simply stops being upserted, and the
 * stale entry will be garbage-collected when the workspace is uninstalled.
 */

export const NewSlackUserCacheModel = v.object({
	orgId: v.string(),
	teamId: v.string(),
	userId: v.string(),
	username: v.string(),
	displayName: v.string(),
	isBot: v.boolean(),
	fetchedAt: v.number(),
});

export const SlackUserCacheModel = v.object({
	_id: v.id("slackUserCache"),
	_creationTime: v.number(),
	...NewSlackUserCacheModel.fields,
});

export type NewSlackUserCache = Infer<typeof NewSlackUserCacheModel>;
export type SlackUserCache = Infer<typeof SlackUserCacheModel>;

export class SlackUserCacheAgg implements IAggregate<SlackUserCache> {
	constructor(private readonly entry: SlackUserCache) {}

	getModel(): SlackUserCache {
		return this.entry;
	}

	isStale(now: number, ttlMs: number): boolean {
		return this.entry.fetchedAt < now - ttlMs;
	}
}
