import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import { verifySlackSignature } from "../_libs/verifySignature";

/**
 * POST /slack/events — Slack's Events API webhook.
 *
 * Flow:
 *   1. Read raw body (required for HMAC).
 *   2. Verify the signing secret header (M1-T06). Invalid → 401.
 *   3. Respond to URL-verification challenges immediately.
 *   4. Short-circuit duplicate `event_id`s via the dedupe table (M1-T04).
 *   5. Resolve `team_id` → slackInstall → orgId. Unknown → 404.
 *   6. `scheduler.runAfter(0, ...)` to hand off to the incoming event
 *      handler so we can return 200 to Slack inside its 3-second budget.
 */
const events = httpAction(async (ctx, request) => {
	const secret = process.env.SLACK_SIGNING_SECRET;
	if (!secret) return jsonResponse({ error: "misconfigured" }, 500);

	const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
	const signature = request.headers.get("x-slack-signature") ?? "";
	const rawBody = await request.text();

	const valid = await verifySlackSignature({
		timestamp,
		rawBody,
		signature,
		secret,
	});
	if (!valid) return jsonResponse({ error: "invalid_signature" }, 401);

	type SlackPayload = {
		type?: string;
		challenge?: string;
		event_id?: string;
		team_id?: string;
		event?: unknown;
	};
	let payload: SlackPayload;
	try {
		payload = JSON.parse(rawBody) as SlackPayload;
	} catch {
		return jsonResponse({ error: "invalid_json" }, 400);
	}

	if (payload.type === "url_verification") {
		return jsonResponse({ challenge: payload.challenge ?? "" }, 200);
	}

	const eventId = payload.event_id;
	const teamId = payload.team_id;
	if (!eventId || !teamId) return jsonResponse({ error: "missing_fields" }, 400);

	const dedupe = await ctx.runMutation(internal.slack.mutations.recordOrSkipEvent.default, {
		eventId,
	});
	if (dedupe === "duplicate") {
		return jsonResponse({ ok: true, deduped: true }, 200);
	}

	const resolution = await ctx.runQuery(internal.slack.queries.resolveInstallByTeamId.default, {
		teamId,
	});
	if (!resolution) return jsonResponse({ error: "unknown_team" }, 404);

	await ctx.scheduler.runAfter(0, internal.slack.actions.handleIncomingEvent.default, {
		orgId: resolution.orgId,
		installId: resolution.installId,
		event: payload.event ?? payload,
	});

	return jsonResponse({ ok: true }, 200);
});

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export default events;
