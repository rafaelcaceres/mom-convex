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
	/**
	 * The member's IANA zone, straight from `users.list` (`tz`). Feeds the
	 * `## Current Time` block so the agent can turn "todo dia às 9h" into a cron
	 * in the zone the person actually lives in — without it, "9am" silently means
	 * 9am UTC, which is 6am in São Paulo (F-10 follow-up).
	 *
	 * Optional because rows cached before this field existed have none; the daily
	 * `syncAllInstallUsers` cron refills them. Absent ⇒ the prompt omits local
	 * time and the agent falls back to UTC, which is wrong-but-honest rather than
	 * wrong-and-confident.
	 */
	tz: v.optional(v.string()),
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
