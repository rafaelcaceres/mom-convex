import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation } from "../../customFunctions";
import { SlackInstallRepository } from "../../slack/adapters/slackInstall.repository";
import { ensureThread } from "../../threads/_libs/ensureThread";
import { EventRepository } from "../adapters/event.repository";
import type { Event } from "../domain/event.model";

/**
 * The one place every event lands when its moment comes (M4-T02). Immediate
 * and one-shot events arrive via `ctx.scheduler`; periodic ones via the
 * `@convex-dev/crons` component — all registered against this reference by
 * `_libs/schedule.ts` (M4-T03), so "what happens when an event fires" exists
 * exactly once.
 *
 * A mutation, not an action, although the spec sketched an action: everything
 * here is transactional work (load, resolve thread, enqueue, mark fired), and
 * doing it in one transaction means a fire either happens completely or not at
 * all — there is no window where the agent got the message but the event still
 * looks unfired, which is the window that produces double reminders on retry.
 *
 * The status re-read at the top is the other half of the cancel design: the
 * scheduler hands out job ids, not locks, so a cancel can race an in-flight
 * fire. Rows are cancelled by *status* (never deleted), and this check turns
 * the race into a logged no-op instead of a reminder the user asked not to
 * receive.
 *
 * The synthesized text is a *user* message in pi-mom's `[EVENT:...]` framing:
 * the agent reads it as an incoming request, with enough shape to know it came
 * from a schedule and not a person. No `senderId` — an event has no human, and
 * inventing one would poison sender-identity hydration downstream.
 */

// What the agent reads, e.g. `[EVENT:periodic:0/5 * * * *] check the queue`.
export function synthesizeEventMessage(event: Pick<Event, "schedule" | "text">): string {
	const desc =
		event.schedule.type === "periodic"
			? event.schedule.cron
			: event.schedule.type === "one-shot"
				? new Date(event.schedule.at).toISOString()
				: "now";
	return `[EVENT:${event.schedule.type}:${desc}] ${event.text}`;
}

const fireInternal = internalMutation({
	args: { eventId: v.id("events") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const agg = await EventRepository.get(ctx, args.eventId);
		if (!agg || !agg.isActive()) {
			// Deleted row or cancel-raced-the-scheduler. Both are by-design quiet:
			// see the module docstring.
			console.log(
				JSON.stringify({
					type: "events.fire",
					eventId: args.eventId,
					skipped: agg ? agg.getModel().status : "missing",
				}),
			);
			return null;
		}
		const event = agg.getModel();
		const now = Date.now();

		// A Slack target whose install was uninstalled cannot receive anything.
		// Warn-and-mark-fired, never throw: throwing makes the scheduler retry a
		// delivery that can only fail again, and for a periodic event it would
		// wedge every future tick behind the same wall.
		if (event.target.type === "slack") {
			const install = await SlackInstallRepository.getByIdString(ctx, event.target.installId);
			if (!install) {
				console.warn(
					JSON.stringify({
						type: "events.fire",
						eventId: event._id,
						scheduleType: event.schedule.type,
						skipped: "slack_install_missing",
						installId: event.target.installId,
					}),
				);
				agg.markFired(now);
				await EventRepository.save(ctx, agg);
				return null;
			}
		}

		const threadId = await ensureThread(ctx, {
			orgId: event.orgId,
			agentId: event.agentId,
			binding: event.target,
		});

		await ctx.scheduler.runAfter(0, internal.agentRunner.actions.handleIncoming.default, {
			orgId: event.orgId,
			threadId,
			userMessage: { text: synthesizeEventMessage(event) },
		});

		agg.markFired(now);
		await EventRepository.save(ctx, agg);

		console.log(
			JSON.stringify({
				type: "events.fire",
				eventId: event._id,
				scheduleType: event.schedule.type,
				threadId,
			}),
		);
		return null;
	},
});

export default fireInternal;
