import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { SlackEventDedupeRepository } from "../adapters/slackEventDedupe.repository";

/**
 * Called by the Slack events httpAction (M1-T07) for every inbound event
 * before any agent work. Returns `"recorded"` on first sight, `"duplicate"`
 * on retries — caller 200s both but short-circuits enqueueing for duplicates.
 */
const recordOrSkipEvent = internalMutation({
	args: { eventId: v.string() },
	returns: v.union(v.literal("recorded"), v.literal("duplicate")),
	handler: async (ctx, args) => {
		return SlackEventDedupeRepository.recordOrSkip(ctx, {
			eventId: args.eventId,
			now: Date.now(),
		});
	},
});

export default recordOrSkipEvent;
