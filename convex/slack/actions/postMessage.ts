import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { decrypt } from "../../_shared/_libs/crypto";
import { internalAction } from "../../customFunctions";
import { markdownToMrkdwn } from "../_libs/markdownToMrkdwn";
import { chatPostMessage } from "../_libs/slackClient";
import { splitForSlack } from "../_libs/splitForSlack";

const MAX_RETRIES_429 = 3;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Slack outbound adapter.
 *
 * Given a thread-bound `installId` + `channelId` + a markdown reply, this:
 *   1. Loads the install (internal query) and decrypts the bot token.
 *   2. Converts markdown → mrkdwn (bold/italic/links/code/mentions).
 *   3. Splits on the 4k-char Slack budget, preserving fenced code blocks.
 *   4. POSTs each chunk via `chat.postMessage` sequentially so order is
 *      preserved. Retries 429 with the header's `Retry-After`; other API
 *      errors throw a ConvexError with the Slack error code.
 */
const postMessage = internalAction({
	args: {
		installId: v.id("slackInstalls"),
		channelId: v.string(),
		threadTs: v.optional(v.string()),
		text: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args): Promise<null> => {
		const install = await ctx.runQuery(internal.slack.queries.getInstallById.default, {
			installId: args.installId,
		});
		if (!install) {
			throw new ConvexError({ code: "install_not_found", installId: args.installId });
		}

		const botToken = await decrypt(install.botTokenEnc);
		const mrkdwn = markdownToMrkdwn(args.text);
		const chunks = splitForSlack(mrkdwn);

		for (const chunk of chunks) {
			await postOneChunk({
				botToken,
				channel: args.channelId,
				text: chunk,
				threadTs: args.threadTs,
			});
		}
		return null;
	},
});

async function postOneChunk(args: {
	botToken: string;
	channel: string;
	text: string;
	threadTs?: string;
}): Promise<void> {
	let attempt = 0;
	while (true) {
		const response = await chatPostMessage(args);
		if (response.status === 429 && attempt < MAX_RETRIES_429) {
			const delayMs = (response.retryAfterSec ?? 1) * 1000;
			await sleep(delayMs);
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
		return;
	}
}

export default postMessage;
