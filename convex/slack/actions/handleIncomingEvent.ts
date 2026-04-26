import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../customFunctions";
import { type SlackUserCache, normalizeSlackEvent } from "../_libs/normalizeEvent";

/**
 * Scheduled by the events httpAction (M1-T07) after dedupe. Responsible for
 * translating a raw Slack event into the platform-agnostic ChannelMessage,
 * resolving the default agent + thread, and handing off to the agentRunner.
 *
 * The user cache is hydrated from `slackUserCache` so `<@U…>` mentions
 * resolve to human-readable handles. If the cache is empty for this team
 * (first event after install, or sync hasn't run yet), we fire-and-forget
 * a `syncUsers` action — the next event picks up the populated cache.
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

		const cachedUsers = await ctx.runQuery(
			internal.slack.queries.getUsersByTeam.default,
			{ teamId: install.teamId },
		);
		const userCache: SlackUserCache = new Map(
			cachedUsers.map((u) => [
				u.userId,
				{ username: u.username, displayName: u.displayName, isBot: u.isBot },
			]),
		);
		if (cachedUsers.length === 0) {
			// First time we see traffic for this workspace — kick off a sync so
			// the next event resolves mentions. Fire-and-forget; this turn
			// proceeds with empty cache (mentions render as `<unknown:U…>` once).
			await ctx.scheduler.runAfter(0, internal.slack.actions.syncUsers.default, {
				installId: args.installId,
			});
		}

		const normalized = normalizeSlackEvent(args.event, {
			userCache,
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
