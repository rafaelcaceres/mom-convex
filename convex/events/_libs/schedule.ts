import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { EventRepository } from "../adapters/event.repository";
import { DEFAULT_TIMEZONE, type EventAgg } from "../domain/event.model";
import { crons } from "./cronsClient";

/**
 * The seam between the `events` table and the two engines that actually keep
 * time (M4-T03): `ctx.scheduler` for run-once shapes, `@convex-dev/crons` for
 * periodic ones. Create and update both need the identical three-way switch,
 * and cancel needs its exact inverse — so both live here, once, next to each
 * other, where they can be read as a pair.
 *
 * Every path lands on `fireInternal` (M4-T02). The engines only decide *when*;
 * what firing means is defined in one place.
 *
 * Handles are persisted on the row (`scheduledId` / `cronName`) because they
 * are the only way back: a pending `runAt` can only be cancelled by its job id,
 * a registered cron only by its name. The name is `event:<eventId>` —
 * deterministic, collision-free (ids are unique), and legible when staring at
 * the component's registry in the dashboard.
 */

export function cronNameFor(eventId: Id<"events">): string {
	return `event:${eventId}`;
}

/**
 * Register the event with the engine its schedule calls for, and persist the
 * resulting handle. Expects a live (`scheduled`) aggregate with no handles —
 * fresh from create, or just passed through `unscheduleEvent`/`reschedule`.
 */
export async function scheduleEvent(ctx: MutationCtx, agg: EventAgg): Promise<void> {
	const event = agg.getModel();

	switch (event.schedule.type) {
		case "immediate": {
			const jobId = await ctx.scheduler.runAfter(
				0,
				internal.events.mutations.fireInternal.default,
				{
					eventId: event._id,
				},
			);
			agg.setScheduledId(jobId);
			break;
		}
		case "one-shot": {
			const jobId = await ctx.scheduler.runAt(
				event.schedule.at,
				internal.events.mutations.fireInternal.default,
				{ eventId: event._id },
			);
			agg.setScheduledId(jobId);
			break;
		}
		case "periodic": {
			const name = cronNameFor(event._id);
			await crons.register(
				ctx,
				{
					kind: "cron",
					cronspec: event.schedule.cron,
					// Always named, never left undefined: handed no `tz`, the
					// component's `cron-parser` resolves against the HOST's local zone,
					// not UTC. That is UTC on Convex today — which is exactly what makes
					// the implicit version dangerous, since it would keep working until
					// it silently didn't. `DEFAULT_TIMEZONE` states the intent.
					tz: event.schedule.timezone ?? DEFAULT_TIMEZONE,
				},
				internal.events.mutations.fireInternal.default,
				{ eventId: event._id },
				name,
			);
			agg.setCronName(name);
			break;
		}
	}

	await EventRepository.save(ctx, agg);
}

/**
 * Withdraw the event from whichever engine holds it, and drop the handles.
 * Does NOT save — the caller always follows with its own state change
 * (`cancel()` or `reschedule()` + `scheduleEvent`) and one save.
 *
 * Tolerant of handles pointing at nothing: a one-shot's job may have already
 * run (cancelling a completed job is a no-op upstream), and a cron may have
 * been removed out-of-band. "Make sure nothing fires" is a goal state, not an
 * operation that can fail because it was already true.
 */
export async function unscheduleEvent(ctx: MutationCtx, agg: EventAgg): Promise<void> {
	const event = agg.getModel();

	if (event.scheduledId !== undefined) {
		await ctx.scheduler.cancel(event.scheduledId as Id<"_scheduled_functions">);
		agg.setScheduledId(undefined);
	}

	if (event.cronName !== undefined) {
		const registered = await crons.get(ctx, { name: event.cronName });
		if (registered) await crons.delete(ctx, { name: event.cronName });
		agg.setCronName(undefined);
	}
}
