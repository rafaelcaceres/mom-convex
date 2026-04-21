import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { signOAuthState } from "../_libs/oauthState";
import { SLACK_DEFAULT_BOT_SCOPES, buildInstallUrl } from "../_libs/slackClient";

/**
 * Called by the `/settings/slack` UI when the user clicks "Connect Slack".
 * Returns the URL the browser should redirect to.
 *
 * We sign a state blob containing `orgId` so the callback httpAction can
 * trust that the org came from a real user flow (not a forged redirect).
 *
 * Owner-only: connecting/disconnecting Slack rewrites bot credentials for
 * the whole workspace, so we gate behind the strongest role.
 */
const createInstallUrl = mutation({
	args: { orgId: v.string() },
	returns: v.object({ url: v.string() }),
	handler: async (ctx, args) => {
		await requireOrgRole(ctx, args.orgId, "owner");

		const clientId = process.env.SLACK_CLIENT_ID;
		const siteUrl = process.env.CONVEX_SITE_URL;
		if (!clientId) throw new Error("SLACK_CLIENT_ID is not set");
		if (!siteUrl) throw new Error("CONVEX_SITE_URL is not set");

		const state = await signOAuthState({ orgId: args.orgId });
		const url = buildInstallUrl({
			clientId,
			scope: SLACK_DEFAULT_BOT_SCOPES,
			state,
			redirectUri: `${siteUrl}/slack/oauth/callback`,
		});
		return { url };
	},
});

export default createInstallUrl;
