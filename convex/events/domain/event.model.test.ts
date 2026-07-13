import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
	EventAgg,
	type EventSchedule,
	assertEventText,
	assertSchedulable,
	nextRunFor,
	parseCron,
} from "./event.model";

/**
 * M4-T01 — the events domain, tested without Convex. Everything here is a pure
 * function or an aggregate over a plain object, which is the point of putting
 * the rules in the domain: the interesting cases (a cron with no future, a fire
 * that races a cancel) are miserable to provoke through the scheduler and
 * trivial to state here.
 */

const NOW = Date.parse("2026-07-12T12:00:00Z");
const HOUR = 3_600_000;

function makeEvent(overrides: Partial<Parameters<typeof buildEvent>[0]> = {}) {
	return buildEvent({ schedule: { type: "immediate" }, ...overrides });
}

function buildEvent(args: {
	schedule: EventSchedule;
	status?: "scheduled" | "cancelled" | "done";
	nextRunAt?: number;
}) {
	return new EventAgg({
		_id: "evt_1" as Id<"events">,
		_creationTime: NOW,
		orgId: "org_A",
		agentId: "agent_1" as Id<"agents">,
		target: { type: "slack", installId: "inst_1", channelId: "C_ENG" },
		text: "check the deploy queue",
		schedule: args.schedule,
		status: args.status ?? "scheduled",
		createdAt: NOW,
		nextRunAt: args.nextRunAt ?? nextRunFor(args.schedule, NOW),
	});
}

describe("M4-T01 event schedule — validation", () => {
	it("accepts an immediate schedule, always", () => {
		expect(() => assertSchedulable({ type: "immediate" }, NOW)).not.toThrow();
		expect(nextRunFor({ type: "immediate" }, NOW)).toBe(NOW);
	});

	it("accepts a one-shot in the future and reports its instant", () => {
		const schedule: EventSchedule = { type: "one-shot", at: NOW + HOUR };
		expect(() => assertSchedulable(schedule, NOW)).not.toThrow();
		expect(nextRunFor(schedule, NOW)).toBe(NOW + HOUR);
	});

	it("rejects a one-shot in the past — `runAt` would fire it immediately", () => {
		// The failure this prevents: a caller with a timezone bug says "remind me
		// yesterday" and gets a message *right now* instead of an error.
		expect(() => assertSchedulable({ type: "one-shot", at: NOW - 1 }, NOW)).toThrow(
			/must be scheduled in the future/,
		);
	});

	it("rejects a one-shot scheduled for exactly now", () => {
		expect(() => assertSchedulable({ type: "one-shot", at: NOW }, NOW)).toThrow(
			/must be scheduled in the future/,
		);
	});

	it("validates a cron expression with croner and reports its next UTC instant", () => {
		const schedule: EventSchedule = { type: "periodic", cron: "*/5 * * * *" };
		expect(() => assertSchedulable(schedule, NOW)).not.toThrow();
		expect(nextRunFor(schedule, NOW)).toBeGreaterThan(NOW);
	});

	it("interprets the cron in UTC — NOW is 12:00Z, so daily-at-13h-UTC is one hour away", () => {
		// Pins the UTC contract: schedules carry no timezone (the delivery engine,
		// @convex-dev/crons, is UTC-only), so 13:00 means 13:00Z, nothing local.
		const next = nextRunFor({ type: "periodic", cron: "0 13 * * *" }, NOW);
		expect(next).toBe(NOW + HOUR);
	});

	it("rejects a malformed cron expression", () => {
		expect(() => parseCron("not a cron")).toThrow(/invalid cron/);
		expect(() => assertSchedulable({ type: "periodic", cron: "99 * * * *" }, NOW)).toThrow(
			/invalid cron/,
		);
	});

	it("rejects a cron that is valid but never occurs (Feb 30th)", () => {
		// Well-formed and unsatisfiable. Accepting it would create an event that is
		// "scheduled" forever and fires never — the worst of both answers.
		expect(() => assertSchedulable({ type: "periodic", cron: "0 0 30 2 *" }, NOW)).toThrow(
			/no future occurrence/,
		);
	});
});

describe("M4-T01 event text", () => {
	it("trims and accepts", () => {
		expect(assertEventText("  ship it  ")).toBe("ship it");
	});

	it("rejects empty or whitespace-only text", () => {
		expect(() => assertEventText("")).toThrow(/cannot be empty/);
		expect(() => assertEventText("   ")).toThrow(/cannot be empty/);
	});

	it("rejects text past the cap", () => {
		expect(() => assertEventText("x".repeat(2001))).toThrow(/exceeds/);
	});
});

describe("M4-T01 EventAgg — lifecycle", () => {
	it("a fresh event is active and its nextRunAt is derived", () => {
		const agg = makeEvent({ schedule: { type: "one-shot", at: NOW + HOUR } });
		expect(agg.isActive()).toBe(true);
		expect(agg.getModel().nextRunAt).toBe(NOW + HOUR);
	});

	it("isReady is false before the instant and true after", () => {
		const agg = makeEvent({ schedule: { type: "one-shot", at: NOW + HOUR } });
		expect(agg.isReady(NOW)).toBe(false);
		expect(agg.isReady(NOW + HOUR)).toBe(true);
	});

	it("cancel marks the event cancelled and clears nextRunAt", () => {
		const agg = makeEvent({ schedule: { type: "one-shot", at: NOW + HOUR } });
		agg.cancel();

		expect(agg.getModel().status).toBe("cancelled");
		expect(agg.getModel().nextRunAt).toBeUndefined();
		expect(agg.isActive()).toBe(false);
		// Belt and braces: a cancelled row can never satisfy the sweep's predicate,
		// even if a future caller forgets to check status.
		expect(agg.isReady(NOW + HOUR)).toBe(false);
	});

	it("cancel is idempotent — a double-click is not an error", () => {
		const agg = makeEvent();
		agg.cancel();
		expect(() => agg.cancel()).not.toThrow();
		expect(agg.getModel().status).toBe("cancelled");
	});

	it("a one-shot that fires is done, not rescheduled", () => {
		const agg = makeEvent({ schedule: { type: "one-shot", at: NOW + HOUR } });
		agg.markFired(NOW + HOUR);

		expect(agg.getModel().status).toBe("done");
		expect(agg.getModel().lastFiredAt).toBe(NOW + HOUR);
		expect(agg.getModel().nextRunAt).toBeUndefined();
		expect(agg.isActive()).toBe(false);
	});

	it("an immediate event that fires is done", () => {
		const agg = makeEvent({ schedule: { type: "immediate" } });
		agg.markFired(NOW);
		expect(agg.getModel().status).toBe("done");
	});

	it("a periodic event that fires stays live and rolls forward", () => {
		const agg = makeEvent({
			schedule: { type: "periodic", cron: "*/5 * * * *" },
		});
		const firstRun = agg.getModel().nextRunAt as number;

		agg.markFired(firstRun);

		expect(agg.getModel().status).toBe("scheduled");
		expect(agg.isActive()).toBe(true);
		expect(agg.getModel().lastFiredAt).toBe(firstRun);
		expect(agg.getModel().nextRunAt).toBeGreaterThan(firstRun);
	});

	it("a periodic run delayed by a backlog does not immediately re-fire to catch up", () => {
		const agg = makeEvent({
			schedule: { type: "periodic", cron: "*/5 * * * *" },
		});
		const due = agg.getModel().nextRunAt as number;

		// The job was due, but the queue was backed up and it actually ran 20 minutes
		// late. Advancing from the *scheduled* time would leave nextRunAt in the past
		// and the sweep would fire it again at once — four times over, catching up on
		// missed ticks nobody asked for.
		const ranLate = due + 20 * 60_000;
		agg.markFired(ranLate);

		expect(agg.getModel().nextRunAt).toBeGreaterThan(ranLate);
		expect(agg.isReady(ranLate)).toBe(false);
	});

	it("firing a cancelled event throws — a cancelled reminder must not be delivered", () => {
		const agg = makeEvent();
		agg.cancel();
		expect(() => agg.markFired(NOW)).toThrow(/cannot fire a cancelled event/);
	});

	it("firing an already-done event throws", () => {
		const agg = makeEvent({ schedule: { type: "one-shot", at: NOW + HOUR } });
		agg.markFired(NOW + HOUR);
		expect(() => agg.markFired(NOW + HOUR)).toThrow(/cannot fire a done event/);
	});

	it("reschedule swaps the schedule, recomputes nextRunAt and drops stale handles", () => {
		const agg = makeEvent({ schedule: { type: "one-shot", at: NOW + HOUR } });
		agg.setScheduledId("job_abc");

		agg.reschedule({ type: "periodic", cron: "0 9 * * *" }, NOW);

		expect(agg.getModel().schedule).toEqual({
			type: "periodic",
			cron: "0 9 * * *",
		});
		expect(agg.getModel().nextRunAt).toBeGreaterThan(NOW);
		// The old job id is gone: the caller must cancel it *before* rescheduling,
		// because afterwards there is nothing left to cancel it with.
		expect(agg.getModel().scheduledId).toBeUndefined();
	});

	it("reschedule rejects a schedule that is not schedulable", () => {
		const agg = makeEvent();
		expect(() => agg.reschedule({ type: "one-shot", at: NOW - 1 }, NOW)).toThrow(
			/must be scheduled in the future/,
		);
	});

	it("reschedule refuses to revive a cancelled event", () => {
		const agg = makeEvent();
		agg.cancel();
		expect(() => agg.reschedule({ type: "one-shot", at: NOW + HOUR }, NOW)).toThrow(
			/cannot reschedule a cancelled event/,
		);
	});
});
