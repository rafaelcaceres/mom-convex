import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { verifyOAuthState } from "../_libs/oauthState";
import { exchangeOAuthCode } from "../_libs/slackClient";

/**
 * GET /slack/oauth/callback?code=...&state=...
 *
 * Slack redirects users here after they approve the install. We verify the
 * signed state, exchange the authorization code for a bot token, and upsert
 * a `slackInstalls` row (replacing any prior install for the same `teamId`).
 *
 * On success we redirect to `/settings/slack?status=ok`. On failure we
 * redirect with `?status=error&reason=<code>` so the UI can display it.
 */
const oauthCallback = httpAction(async (ctx, request) => {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const siteUrl = process.env.SITE_URL ?? url.origin;

	if (!code || !state) return redirectToSettings(siteUrl, "missing_params");

	const verified = await verifyOAuthState({ state });
	if (!verified) return redirectToSettings(siteUrl, "invalid_state");

	const clientId = process.env.SLACK_CLIENT_ID;
	const clientSecret = process.env.SLACK_CLIENT_SECRET;
	const convexSiteUrl = process.env.CONVEX_SITE_URL;
	if (!clientId || !clientSecret || !convexSiteUrl) {
		return redirectToSettings(siteUrl, "misconfigured");
	}

	const exchange = await exchangeOAuthCode({
		clientId,
		clientSecret,
		code,
		redirectUri: `${convexSiteUrl}/slack/oauth/callback`,
	});

	if (!exchange.ok) return redirectToSettings(siteUrl, exchange.error);

	await ctx.runMutation(internal.slack.mutations.persistInstall.default, {
		orgId: verified.orgId,
		teamId: exchange.team.id,
		teamName: exchange.team.name,
		botToken: exchange.access_token,
		scope: exchange.scope,
		botUserId: exchange.bot_user_id,
	});

	return redirectToSettings(siteUrl, "ok");
});

function redirectToSettings(siteUrl: string, status: string): Response {
	const to = `${siteUrl}/settings/slack?status=${encodeURIComponent(status)}`;
	return Response.redirect(to, 302);
}

export default oauthCallback;
