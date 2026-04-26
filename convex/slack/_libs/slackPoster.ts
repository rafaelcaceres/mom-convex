import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { decrypt } from "../../_shared/_libs/crypto";
import { chatPostMessage, chatUpdate } from "./slackClient";

/**
 * Slack outbound primitives shared by `slack.actions.postOrUpdateMain`,
 * `slack.actions.postToolReply`, and `agentRunner.handleIncoming` (the
 * latter calls them inline so the streamed turn can capture the parent
 * `ts` and post tool-call replies under it). Retry on 429 with the
 * server-supplied `Retry-After`; any other API error throws a
 * `ConvexError` carrying the Slack `error` code.
 */

const MAX_RETRIES_429 = 3;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadBotToken(
	ctx: ActionCtx,
	installId: Id<"slackInstalls">,
): Promise<string> {
	const install = await ctx.runQuery(internal.slack.queries.getInstallById.default, {
		installId,
	});
	if (!install) {
		throw new ConvexError({ code: "install_not_found", installId });
	}
	return decrypt(install.botTokenEnc);
}

export async function postSlackMessage(args: {
	botToken: string;
	channel: string;
	text: string;
	blocks?: unknown[];
	threadTs?: string;
}): Promise<string> {
	let attempt = 0;
	while (true) {
		const response = await chatPostMessage(args);
		if (response.status === 429 && attempt < MAX_RETRIES_429) {
			await sleep((response.retryAfterSec ?? 1) * 1000);
			attempt += 1;
			continue;
		}
		if (!response.result.ok) {
			throw new ConvexError({
				code: "slack_post_failed",
				error: response.result.error,
				status: response.status,
			});
		}
		return response.result.ts;
	}
}

export async function updateSlackMessage(args: {
	botToken: string;
	channel: string;
	ts: string;
	text: string;
	blocks?: unknown[];
}): Promise<void> {
	let attempt = 0;
	while (true) {
		const response = await chatUpdate(args);
		if (response.status === 429 && attempt < MAX_RETRIES_429) {
			await sleep((response.retryAfterSec ?? 1) * 1000);
			attempt += 1;
			continue;
		}
		if (!response.result.ok) {
			throw new ConvexError({
				code: "slack_update_failed",
				error: response.result.error,
				status: response.status,
			});
		}
		return;
	}
}
