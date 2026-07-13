import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { unscheduleEvent } from "../_libs/schedule";
import { EventRepository } from "../adapters/event.repository";

/**
 * Cancel an event on the agent's own behalf — the back end of `event.cancel`
 * (F-10). The conversational brake: until the events UI (M4-T04) exists, a
 * wrongly-created periodic cron would otherwise burn an agent turn per tick
 * with nothing but a dashboard mutation to stop it. "Na verdade, esquece" has
 * to work.
 *
 * The tenant boundary is the same structural one as `createFromAgentInternal`:
 * the event must belong to this turn's org AND this agent. The model can only
 * name eventIds it learned from `event.list` (already so filtered), but ids
 * are strings and models hallucinate them — hence checked here, not trusted.
 *
 * Idempotent, like the public `cancelEvent`: cancelling twice converges.
 */
const cancelFromAgentInternal = internalMutation({
	args: {
		orgId: v.string(),
		agentId: v.id("agents"),
		eventId: v.id("events"),
	},
	returns: v.object({
		cancelled: v.boolean(),
		/** What the row's status is now — lets the model phrase an honest reply. */
		status: v.union(v.literal("cancelled"), v.literal("done")),
	}),
	handler: async (ctx, args) => {
		const agg = await EventRepository.get(ctx, args.eventId);
		if (!agg) throw new Error("Event not found");
		const event = agg.getModel();
		if (event.orgId !== args.orgId || event.agentId !== args.agentId) {
			// Same message as not-found on purpose: "exists but is someone else's"
			// is not information the model should be able to probe for.
			throw new Error("Event not found");
		}

		// A done one-shot has nothing left to cancel; report instead of erroring —
		// "cancel my reminder" after it already fired is an honest state, not a bug.
		if (event.status === "done") return { cancelled: false, status: "done" as const };

		await unscheduleEvent(ctx, agg);
		agg.cancel();
		await EventRepository.save(ctx, agg);
		return { cancelled: true, status: "cancelled" as const };
	},
});

export default cancelFromAgentInternal;
