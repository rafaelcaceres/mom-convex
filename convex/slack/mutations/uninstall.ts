import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { SlackInstallRepository } from "../adapters/slackInstall.repository";

/**
 * Owner-only disconnect. Deletes the `slackInstalls` row immediately so the
 * events httpAction stops routing Slack traffic to this org, and schedules a
 * best-effort `auth.revoke` call to Slack with the still-plaintext token
 * (captured before deletion). If revoke fails the row is already gone — the
 * token becomes unusable for us regardless.
 */
const uninstall = mutation({
	args: { installId: v.id("slackInstalls") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const agg = await SlackInstallRepository.get(ctx, args.installId);
		if (!agg) throw new Error("Slack install not found");

		const install = agg.getModel();
		await requireOrgRole(ctx, install.orgId, "owner");

		const botToken = await agg.decryptBotToken();
		await SlackInstallRepository.delete(ctx, install._id);

		await ctx.scheduler.runAfter(0, internal.slack.actions.revokeToken.default, {
			botToken,
		});

		return null;
	},
});

export default uninstall;
