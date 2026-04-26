import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { decrypt } from "../../_shared/_libs/crypto";
import { internalAction } from "../../customFunctions";
import { fetchAllUsers } from "../_libs/usersFetcher";

const BATCH_SIZE = 100;

/**
 * Refresh the per-team Slack user directory cache. Walks `users.list` until
 * exhausted, filters out deleted users (the fetcher does this), then writes
 * upserts to `slackUserCache` in chunks so a 5 000-member workspace doesn't
 * exceed Convex's per-mutation document limit.
 *
 * Triggered by:
 *   - the daily `slack:syncAllInstalls` cron (once per workspace)
 *   - on-demand from the settings UI (owner-only mutation, future M2-T18)
 *   - first-time hydration when `handleIncoming` sees an empty cache
 *
 * Idempotent: re-running mid-flight just rewrites the same rows. Failure
 * mid-walk leaves a partial cache — next run completes the rest.
 */
const syncUsers = internalAction({
	args: { installId: v.id("slackInstalls") },
	returns: v.object({ count: v.number() }),
	handler: async (ctx, args): Promise<{ count: number }> => {
		const install = await ctx.runQuery(internal.slack.queries.getInstallById.default, {
			installId: args.installId,
		});
		if (!install) {
			throw new ConvexError({ code: "install_not_found", installId: args.installId });
		}

		const botToken = await decrypt(install.botTokenEnc);
		const users = await fetchAllUsers({ botToken });

		const fetchedAt = Date.now();
		for (let i = 0; i < users.length; i += BATCH_SIZE) {
			const batch = users.slice(i, i + BATCH_SIZE);
			await ctx.runMutation(internal.slack.mutations.upsertCachedUsers.default, {
				orgId: install.orgId,
				teamId: install.teamId,
				fetchedAt,
				users: batch,
			});
		}

		return { count: users.length };
	},
});

export default syncUsers;
