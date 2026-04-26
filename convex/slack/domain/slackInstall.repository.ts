import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { NewSlackInstall, SlackInstall, SlackInstallAgg } from "./slackInstall.model";

export interface ISlackInstallRepository extends IRepository<"slackInstalls", SlackInstallAgg> {
	getByTeamId(
		ctx: QueryCtx,
		clause: { teamId: SlackInstall["teamId"] },
	): Promise<SlackInstallAgg | null>;

	listByOrg(ctx: QueryCtx, clause: { orgId: SlackInstall["orgId"] }): Promise<SlackInstallAgg[]>;

	/**
	 * List every install across all orgs. Used only by the daily user-cache
	 * refresh cron (`syncAllInstallUsers`) to fan out per-workspace sync
	 * jobs — never expose to user-facing queries.
	 */
	listAll(ctx: QueryCtx): Promise<SlackInstallAgg[]>;

	/**
	 * Create-or-update by `teamId` (Slack's native identifier). OAuth re-install
	 * must replace the token + metadata but keep the same row so thread history
	 * and org ownership are preserved.
	 */
	upsertByTeamId(ctx: MutationCtx, data: NewSlackInstall): Promise<SlackInstallAgg>;
}
