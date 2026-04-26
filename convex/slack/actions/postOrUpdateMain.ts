import { v } from "convex/values";
import { internalAction } from "../../customFunctions";
import { markdownToMrkdwn } from "../_libs/markdownToMrkdwn";
import { loadBotToken, postSlackMessage, updateSlackMessage } from "../_libs/slackPoster";

/**
 * Single-message variant of the M1-T10 outbound adapter (F-03). When `ts`
 * is absent, posts a fresh anchor message and returns its `ts`; when
 * present, edits that message in place via `chat.update`. The returned
 * `ts` is the parent for any tool-call thread replies (`postToolReply`).
 *
 * Caller-side serialization (one in-flight call per turn) is the caller's
 * responsibility — the action itself is stateless aside from Slack's own
 * 429 retry. This action does no chunk-splitting; long-form replies stay
 * with the legacy `postMessage` adapter for now (F-03 explicitly defers
 * incremental streaming).
 */
const postOrUpdateMain = internalAction({
	args: {
		installId: v.id("slackInstalls"),
		channelId: v.string(),
		threadTs: v.optional(v.string()),
		ts: v.optional(v.string()),
		text: v.string(),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		const botToken = await loadBotToken(ctx, args.installId);
		const mrkdwn = markdownToMrkdwn(args.text);
		if (args.ts) {
			await updateSlackMessage({
				botToken,
				channel: args.channelId,
				ts: args.ts,
				text: mrkdwn,
			});
			return args.ts;
		}
		return postSlackMessage({
			botToken,
			channel: args.channelId,
			threadTs: args.threadTs,
			text: mrkdwn,
		});
	},
});

export default postOrUpdateMain;
