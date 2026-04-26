import { v } from "convex/values";
import { internalAction } from "../../customFunctions";
import { markdownToMrkdwn } from "../_libs/markdownToMrkdwn";
import { loadBotToken, postSlackMessage } from "../_libs/slackPoster";

/**
 * Posts a tool-call card as a thread reply under the bot's anchor message
 * (`parentTs`, captured by `postOrUpdateMain` and persisted on the slack
 * binding). Returns the reply's own `ts` so callers can subsequently edit
 * it (e.g. attach the tool result after it lands). 429 is retried with
 * the same shape as `postSlackMessage`.
 */
const postToolReply = internalAction({
	args: {
		installId: v.id("slackInstalls"),
		channelId: v.string(),
		parentTs: v.string(),
		text: v.string(),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		const botToken = await loadBotToken(ctx, args.installId);
		const mrkdwn = markdownToMrkdwn(args.text);
		return postSlackMessage({
			botToken,
			channel: args.channelId,
			threadTs: args.parentTs,
			text: mrkdwn,
		});
	},
});

export default postToolReply;
