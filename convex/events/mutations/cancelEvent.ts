import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { unscheduleEvent } from "../_libs/schedule";
import { EventRepository } from "../adapters/event.repository";

/**
 * Stop an event from ever firing again (M4-T03): withdraw it from its engine
 * (pending `runAt` job or registered cron), then mark the row `cancelled`.
 *
 * The row stays — the UI's history depends on it, and `fireInternal` re-reads
 * status precisely so that a job already in flight when this runs delivers
 * nothing. Idempotent end to end: cancelling twice, or cancelling something
 * already done, converges on the same quiet state a double-click deserves.
 */
const cancelEvent = mutation({
	args: { eventId: v.id("events") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const agg = await EventRepository.get(ctx, args.eventId);
		if (!agg) throw new Error("Event not found");

		await requireOrgRole(ctx, agg.getModel().orgId, "member");

		await unscheduleEvent(ctx, agg);
		agg.cancel();
		await EventRepository.save(ctx, agg);
		return null;
	},
});

export default cancelEvent;
