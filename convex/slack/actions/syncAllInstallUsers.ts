import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../customFunctions";

/**
 * Daily cron entrypoint. Schedules a `syncUsers` run for every install we
 * have, refreshing the per-team user cache so renames and new joiners flow
 * into mention resolution within 24h of happening on Slack's side.
 *
 * Per-install jobs are dispatched via the scheduler (not awaited inline) so
 * one slow workspace can't hold up the cron tick or starve others. Each
 * `syncUsers` is itself idempotent.
 */
const syncAllInstallUsers = internalAction({
	args: {},
	returns: v.object({ scheduled: v.number() }),
	handler: async (ctx): Promise<{ scheduled: number }> => {
		const installs = await ctx.runQuery(
			internal.slack.queries.listAllInstallIds.default,
			{},
		);
		for (const install of installs) {
			await ctx.scheduler.runAfter(0, internal.slack.actions.syncUsers.default, {
				installId: install._id,
			});
		}
		return { scheduled: installs.length };
	},
});

export default syncAllInstallUsers;
