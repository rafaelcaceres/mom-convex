import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../customFunctions";
import { type SlackUserCache, normalizeSlackEvent } from "../_libs/normalizeEvent";

/**
 * Scheduled by the events httpAction (M1-T07) after dedupe. Responsible for
 * translating a raw Slack event into the platform-agnostic ChannelMessage,
 * resolving the default agent + thread, and handing off to the agentRunner.
 *
 * M1: user cache is empty (cache-population work lands with real users
 * resolution in M2). The bot's own user id comes from the install so
 * `<@bot>` mentions still get handled as such.
 */
const handleIncomingEvent = internalAction({
	args: {
		orgId: v.string(),
		installId: v.id("slackInstalls"),
		event: v.any(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const install = await ctx.runQuery(internal.slack.queries.getInstallById.default, {
			installId: args.installId,
		});
		if (!install) return null;

		const emptyCache: SlackUserCache = new Map();
		const normalized = normalizeSlackEvent(args.event, {
			userCache: emptyCache,
			botUserId: install.botUserId,
		});
		if (!normalized) return null;

		const agent = await ctx.runQuery(internal.agents.queries.getDefaultInternal.default, {
			orgId: args.orgId,
		});
		if (!agent) return null;

		const threadId = await ctx.runMutation(internal.threads.mutations.ensureThread.default, {
			orgId: args.orgId,
			agentId: agent._id,
			binding: {
				type: "slack",
				installId: args.installId,
				channelId: normalized.channelId,
				threadTs: normalized.replyTo,
			},
		});

		await ctx.scheduler.runAfter(0, internal.agentRunner.actions.handleIncoming.default, {
			orgId: args.orgId,
			threadId,
			userMessage: {
				text: normalized.text,
				senderId: normalized.sender.id,
			},
		});

		return null;
	},
});

export default handleIncomingEvent;
