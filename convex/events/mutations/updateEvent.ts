import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { scheduleEvent, unscheduleEvent } from "../_libs/schedule";
import { EventRepository } from "../adapters/event.repository";
import { EventScheduleModel } from "../domain/event.model";

/**
 * Edit a live event (M4-T03). Text and schedule are independently optional;
 * target and agent are not editable — retargeting crosses authz boundaries the
 * create-time checks were built around, so it is delete-and-recreate, the same
 * stance `upsertMemory` takes on scope changes.
 *
 * A schedule change is unschedule-old → reschedule-new **in that order**:
 * `reschedule()` drops the engine handles from the row, so cancelling after it
 * would have nothing left to cancel by. All in one transaction — no window
 * where the event exists with either two schedules or none.
 */
const updateEvent = mutation({
	args: {
		eventId: v.id("events"),
		text: v.optional(v.string()),
		schedule: v.optional(EventScheduleModel),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const agg = await EventRepository.get(ctx, args.eventId);
		if (!agg) throw new Error("Event not found");

		await requireOrgRole(ctx, agg.getModel().orgId, "member");

		if (!agg.isActive()) {
			throw new Error(`cannot update a ${agg.getModel().status} event`);
		}

		if (args.text !== undefined) agg.updateText(args.text);

		if (args.schedule !== undefined) {
			await unscheduleEvent(ctx, agg);
			agg.reschedule(args.schedule, Date.now());
			await scheduleEvent(ctx, agg); // saves
		} else {
			await EventRepository.save(ctx, agg);
		}
		return null;
	},
});

export default updateEvent;
