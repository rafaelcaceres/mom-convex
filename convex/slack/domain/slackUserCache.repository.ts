import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type {
	NewSlackUserCache,
	SlackUserCache,
	SlackUserCacheAgg,
} from "./slackUserCache.model";

export interface ISlackUserCacheRepository
	extends IRepository<"slackUserCache", SlackUserCacheAgg> {
	/**
	 * Look up a cached user by `(teamId, userId)`. Returns `null` when the
	 * cache hasn't been populated yet for this team or the user joined after
	 * the last sync.
	 */
	getByTeamUser(
		ctx: QueryCtx,
		clause: { teamId: SlackUserCache["teamId"]; userId: SlackUserCache["userId"] },
	): Promise<SlackUserCacheAgg | null>;

	/**
	 * Bulk fetch every cached user for a team. Used to hydrate the in-memory
	 * `SlackUserCache` map at the start of an agent turn.
	 */
	listByTeam(
		ctx: QueryCtx,
		clause: { teamId: SlackUserCache["teamId"] },
	): Promise<SlackUserCacheAgg[]>;

	/**
	 * Insert-or-replace by `(teamId, userId)`. Used by `syncUsers` to refresh
	 * the directory in batches; idempotent so a re-run of the action is safe.
	 */
	upsertByTeamUser(ctx: MutationCtx, data: NewSlackUserCache): Promise<SlackUserCacheAgg>;
}
