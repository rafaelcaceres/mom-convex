import { type Infer, v } from "convex/values";
import { Cron } from "croner";
import type { IAggregate } from "../../_shared/_libs/aggregate";
import { SlackBindingModel, WebBindingModel } from "../../threads/domain/thread.model";

/**
 * An event is the agent scheduling *itself*: "remind me in an hour", "check the
 * deploy queue every five minutes". Three shapes, one table (M4-T01).
 *
 *  - `immediate` — fire once, now. Exists so an agent can hand work to a fresh
 *    turn (and a fresh context window) instead of doing it inline.
 *  - `one-shot`  — fire once, at `at`.
 *  - `periodic`  — fire on a UTC cron schedule, forever.
 *
 * **Why the schedule is a discriminated union and not flat optional fields.**
 * The obvious shape is `type` plus `at?` plus `cron?`, and it is a trap: it
 * types a periodic event with no cron, and a one-shot with a cron, as perfectly
 * legal. Every read site then has to re-establish an invariant the schema
 * declined to state, and the day one of them forgets, the failure is a cron job
 * that silently never fires. As a union, "one-shot carries an `at`" is a fact
 * the compiler and the validator both enforce, and there is no unreachable state
 * to defend against downstream.
 *
 * `nextRunAt` is denormalized to the top level anyway, because Convex indexes
 * cannot reach inside a union member and `listReady` is the query the scheduler
 * lifecycle (M4-T03) is built on. It is derived — never authored — via
 * `nextRunFor`.
 *
 * **Target, not binding-with-an-`event`-arm.** The event points at *where its
 * message should land*: a Slack channel or a user's web thread. It deliberately
 * reuses the `threads` domain's binding validators rather than redefining them,
 * so `M4-T02`'s `ensureThread` receives something it already knows how to
 * resolve. The `event` arm of `AdapterBinding` is excluded — an event whose
 * target is an event is not a thing.
 */

export const ImmediateScheduleModel = v.object({ type: v.literal("immediate") });

export const OneShotScheduleModel = v.object({
	type: v.literal("one-shot"),
	/** Epoch ms. Must be in the future at create time — see `assertSchedulable`. */
	at: v.number(),
});

export const PeriodicScheduleModel = v.object({
	type: v.literal("periodic"),
	/**
	 * Standard 5-field (or 6-field with seconds) cron, interpreted in **UTC**.
	 *
	 * No timezone field, deliberately: delivery is owned by `@convex-dev/crons`
	 * (M4-T03), which is UTC-only — a `timezone` the engine doesn't honour would
	 * be a lie in the schema, worse than the limitation itself. If zones become a
	 * requirement, that is an engine change (or an edge-side conversion for
	 * fixed-time crons), not a field to quietly add here.
	 */
	cron: v.string(),
});

export const EventScheduleModel = v.union(
	ImmediateScheduleModel,
	OneShotScheduleModel,
	PeriodicScheduleModel,
);

/** Where the event's synthesized message lands. Mirror of `threads`' binding, minus `event`. */
export const EventTargetModel = v.union(SlackBindingModel, WebBindingModel);

/**
 * `scheduled` → live. `cancelled` → user pulled it. `done` → a one-shot or
 * immediate that has fired.
 *
 * Cancel is a status change, not a row delete, and that is deliberate: the
 * Convex scheduler hands out a job id, not a lock, so a job can already be in
 * flight when the user cancels. `fire` (M4-T02) re-reads status before doing
 * anything, which turns that race into a no-op instead of a message the user
 * explicitly asked not to receive. It also means "why didn't my reminder fire?"
 * has an answer in the table rather than in a log.
 */
export const EventStatusModel = v.union(
	v.literal("scheduled"),
	v.literal("cancelled"),
	v.literal("done"),
);

export const NewEventModel = v.object({
	orgId: v.string(),
	agentId: v.id("agents"),
	target: EventTargetModel,
	/** What the agent will read when this fires. Synthesized into a user message by M4-T02. */
	text: v.string(),
	schedule: EventScheduleModel,
	status: EventStatusModel,
	createdAt: v.number(),
	/** Derived from `schedule` — never authored. `undefined` once the event is dead. */
	nextRunAt: v.optional(v.number()),
	lastFiredAt: v.optional(v.number()),
	/** `ctx.scheduler` job id, so a cancel can reach the pending run (immediate / one-shot). */
	scheduledId: v.optional(v.string()),
	/** Registered cron name, so a cancel can unregister it (periodic). */
	cronName: v.optional(v.string()),
});

export const EventModel = v.object({
	_id: v.id("events"),
	_creationTime: v.number(),
	...NewEventModel.fields,
});

export type ImmediateSchedule = Infer<typeof ImmediateScheduleModel>;
export type OneShotSchedule = Infer<typeof OneShotScheduleModel>;
export type PeriodicSchedule = Infer<typeof PeriodicScheduleModel>;
export type EventSchedule = Infer<typeof EventScheduleModel>;
export type EventTarget = Infer<typeof EventTargetModel>;
export type EventStatus = Infer<typeof EventStatusModel>;
export type NewEvent = Infer<typeof NewEventModel>;
export type Event = Infer<typeof EventModel>;

export const MAX_EVENT_TEXT_CHARS = 2000;

/**
 * Parse a cron expression (UTC), or throw. Delivery is owned by
 * `@convex-dev/crons` (M4-T03); `croner` is used here only to *validate* the
 * pattern at the boundary and to derive `nextRunAt` for the UI — both in UTC,
 * matching the engine, so what validates here cannot disagree with what runs
 * there.
 *
 * Constructed without a handler, so nothing is scheduled as a side effect of
 * asking whether the string is well-formed. The `nextRun()` probe forces lazy
 * parts of croner's resolution to happen now, while there is still a caller to
 * hand the error back to.
 */
export function parseCron(cron: string): Cron {
	try {
		const parsed = new Cron(cron, { timezone: "UTC" });
		parsed.nextRun();
		return parsed;
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new Error(`invalid cron "${cron}": ${reason}`);
	}
}

/**
 * When this schedule should next fire, or `undefined` if it never will again.
 *
 * A periodic schedule whose cron has no future occurrence (croner returns null —
 * e.g. `0 0 30 2 *`, February 30th) yields `undefined` rather than throwing: the
 * expression is *valid*, it simply never comes true. Letting it through as a
 * scheduled event that silently never runs would be worse than either.
 */
export function nextRunFor(schedule: EventSchedule, now: number): number | undefined {
	switch (schedule.type) {
		case "immediate":
			return now;
		case "one-shot":
			return schedule.at;
		case "periodic": {
			const next = parseCron(schedule.cron).nextRun(new Date(now));
			return next ? next.getTime() : undefined;
		}
	}
}

/**
 * Reject a schedule that cannot be honoured, at the boundary rather than at fire
 * time. Called by the create/update mutations (M4-T03).
 *
 * A one-shot in the past is the interesting case: `scheduler.runAt` with a past
 * timestamp fires *immediately*, so accepting it would turn "remind me yesterday"
 * — invariably a timezone bug on the caller's side — into a message right now.
 * Failing loudly is the only reading that respects what the user meant.
 */
export function assertSchedulable(schedule: EventSchedule, now: number): void {
	switch (schedule.type) {
		case "immediate":
			return;
		case "one-shot":
			if (schedule.at <= now) {
				throw new Error(`one-shot event must be scheduled in the future (at=${schedule.at})`);
			}
			return;
		case "periodic": {
			// Throws on a malformed pattern.
			parseCron(schedule.cron);
			if (nextRunFor(schedule, now) === undefined) {
				throw new Error(`cron "${schedule.cron}" has no future occurrence`);
			}
			return;
		}
	}
}

export function assertEventText(text: string): string {
	const trimmed = text.trim();
	if (trimmed.length === 0) throw new Error("event text cannot be empty");
	if (trimmed.length > MAX_EVENT_TEXT_CHARS) {
		throw new Error(`event text exceeds ${MAX_EVENT_TEXT_CHARS} chars`);
	}
	return trimmed;
}

export class EventAgg implements IAggregate<Event> {
	constructor(private readonly event: Event) {}

	getModel(): Event {
		return this.event;
	}

	/** Live: still eligible to fire. */
	isActive(): boolean {
		return this.event.status === "scheduled";
	}

	/** Due: live, and its next run has come. The predicate behind `listReady`. */
	isReady(now: number): boolean {
		if (!this.isActive()) return false;
		return this.event.nextRunAt !== undefined && this.event.nextRunAt <= now;
	}

	/**
	 * Stop firing. Idempotent — cancelling twice is what a double-click looks
	 * like, and it is not an error.
	 *
	 * Clears `nextRunAt` so a cancelled row can never satisfy `listReady`, even
	 * if some future caller forgets to check status.
	 */
	cancel(): void {
		if (this.event.status === "scheduled") this.event.status = "cancelled";
		this.event.nextRunAt = undefined;
	}

	/**
	 * Record a fire and advance the schedule. Periodic events roll forward to
	 * their next occurrence and stay live; one-shot and immediate events are done.
	 *
	 * Firing a dead event is a programming error, not a no-op to swallow: `fire`
	 * (M4-T02) is expected to check `isActive` first, and reaching here anyway
	 * means a cancelled reminder was about to be delivered.
	 */
	markFired(now: number): void {
		if (!this.isActive()) {
			throw new Error(`cannot fire a ${this.event.status} event`);
		}
		this.event.lastFiredAt = now;

		if (this.event.schedule.type === "periodic") {
			// From `now`, not from the scheduled time: a run delayed by a backlog
			// should not immediately re-fire trying to catch up on what it missed.
			const next = nextRunFor(this.event.schedule, now);
			if (next === undefined) {
				this.event.status = "done";
				this.event.nextRunAt = undefined;
				return;
			}
			this.event.nextRunAt = next;
			return;
		}

		this.event.status = "done";
		this.event.nextRunAt = undefined;
	}

	/** Job id from `ctx.scheduler`, kept so a cancel can reach the pending run. */
	setScheduledId(id: string | undefined): void {
		this.event.scheduledId = id;
	}

	setCronName(name: string | undefined): void {
		this.event.cronName = name;
	}

	/**
	 * Replace the schedule (M4-T03's `updateEvent`). Recomputes `nextRunAt` and
	 * drops the old handles — the caller is responsible for unregistering them
	 * from the scheduler before calling this, and cannot do so afterwards if we
	 * have already thrown them away.
	 */
	reschedule(schedule: EventSchedule, now: number): void {
		if (!this.isActive()) {
			throw new Error(`cannot reschedule a ${this.event.status} event`);
		}
		assertSchedulable(schedule, now);
		this.event.schedule = schedule;
		this.event.nextRunAt = nextRunFor(schedule, now);
		this.event.scheduledId = undefined;
		this.event.cronName = undefined;
	}

	updateText(next: string): void {
		this.event.text = assertEventText(next);
	}
}
