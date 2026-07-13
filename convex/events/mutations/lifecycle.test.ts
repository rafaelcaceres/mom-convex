import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { mockTextModel } from "../../../test/_helpers/mockLanguageModel";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { _clearAgentCache, _setLanguageModelOverride } from "../../agents/_libs/agentFactory";
import { crons } from "../_libs/cronsClient";
import { cronNameFor } from "../_libs/schedule";
import type { EventSchedule, EventTarget } from "../domain/event.model";

/**
 * M4-T03 — create / cancel / update against the REAL `@convex-dev/crons`
 * component and the real scheduler, through the real authz stack. What these
 * mutations owe is bookkeeping symmetry: every row in `events` claiming to be
 * scheduled has a live handle in exactly one engine, and every dead row has
 * none. The tests read both sides (row + engine) and check they agree.
 *
 * ⚠️ No `finishAllScheduledFunctions` anywhere in this file: with a periodic
 * cron registered, the component re-schedules itself forever and the drain
 * never terminates. Assertions inspect scheduler/registry state instead of
 * running it.
 */

const HOUR = 3_600_000;

type T = ReturnType<typeof newTest>;

/**
 * Fake timers for the whole file, advanced only where a test says so. An
 * immediate event arms a real `setTimeout(0)` otherwise, which fires on the
 * next event-loop tick — mid-test, racing the foreground against convex-test's
 * single transaction manager and emitting flaky "Transaction already
 * committed" noise. Frozen timers make every test here pure state inspection.
 */
beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
	});
});

afterEach(() => {
	vi.useRealTimers();
});

async function setup(t: T, orgName = "Acme") {
	const userId = await t.run((ctx) => ctx.db.insert("users", {}));
	const member = t.withIdentity({ subject: userId });
	const { orgId } = await member.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName,
	});
	const agents = await member.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;
	return { member, userId, orgId, agentId };
}

function create(
	s: Awaited<ReturnType<typeof setup>>,
	over: { schedule: EventSchedule; target?: EventTarget; text?: string },
) {
	return s.member.mutation(api.events.mutations.createEvent.default, {
		orgId: s.orgId,
		agentId: s.agentId,
		target: over.target ?? { type: "web", userId: s.userId },
		text: over.text ?? "check the deploy queue",
		schedule: over.schedule,
	});
}

/** Pending/complete `fireInternal` jobs on the app's own scheduler. */
async function fireJobs(t: T) {
	return t.run(async (ctx) => {
		const jobs = await ctx.db.system.query("_scheduled_functions").collect();
		return jobs
			.filter((j) => j.name.includes("fireInternal"))
			.map((j) => ({
				state: j.state.kind,
				scheduledTime: j.scheduledTime,
				args: j.args[0] as Record<string, unknown>,
			}));
	});
}

const cronOf = (t: T, eventId: Id<"events">) =>
	t.run((ctx) => crons.get(ctx, { name: cronNameFor(eventId) }));

const eventRow = (t: T, id: Id<"events">) => t.run((ctx) => ctx.db.get(id));

describe("M4-T03 createEvent", () => {
	it("immediate: enqueues fireInternal now and persists the job handle", async () => {
		const t = newTest();
		const s = await setup(t);

		const eventId = await create(s, { schedule: { type: "immediate" } });

		const jobs = await fireJobs(t);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.args).toEqual({ eventId });

		const row = await eventRow(t, eventId);
		expect(row?.status).toBe("scheduled");
		expect(row?.scheduledId).toBeDefined();
		expect(row?.cronName).toBeUndefined();

		// Withdraw the pending 0ms job: its real setTimeout would otherwise fire
		// after this test tears down and die noisily on the dead instance.
		await s.member.mutation(api.events.mutations.cancelEvent.default, { eventId });
	});

	it("one-shot: enqueues fireInternal at the exact instant", async () => {
		const t = newTest();
		const s = await setup(t);
		const at = Date.now() + HOUR;

		const eventId = await create(s, { schedule: { type: "one-shot", at } });

		const jobs = await fireJobs(t);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.scheduledTime).toBe(at);
		expect((await eventRow(t, eventId))?.scheduledId).toBeDefined();
	});

	it("periodic: registers a named cron in the component and persists the name", async () => {
		const t = newTest();
		const s = await setup(t);

		const eventId = await create(s, { schedule: { type: "periodic", cron: "*/5 * * * *" } });

		const cron = await cronOf(t, eventId);
		expect(cron).not.toBeNull();
		expect(cron?.schedule).toEqual({ kind: "cron", cronspec: "*/5 * * * *", tz: "UTC" });

		const row = await eventRow(t, eventId);
		expect(row?.cronName).toBe(cronNameFor(eventId));
		expect(row?.scheduledId).toBeUndefined();
		// No stray scheduler job on the app side — the component owns delivery.
		expect(await fireJobs(t)).toHaveLength(0);
	});

	it("rejects what the domain rejects: past one-shot, bad cron, empty text", async () => {
		const t = newTest();
		const s = await setup(t);

		await expect(create(s, { schedule: { type: "one-shot", at: Date.now() - 1 } })).rejects.toThrow(
			/future/,
		);
		await expect(create(s, { schedule: { type: "periodic", cron: "not a cron" } })).rejects.toThrow(
			/invalid cron/,
		);
		await expect(create(s, { schedule: { type: "immediate" }, text: "  " })).rejects.toThrow(
			/empty/,
		);
		// Nothing leaked into either engine on the way down.
		expect(await fireJobs(t)).toHaveLength(0);
	});

	it("rejects an agent from another org", async () => {
		const t = newTest();
		const a = await setup(t, "Org A");
		const b = await setup(t, "Org B");

		await expect(
			a.member.mutation(api.events.mutations.createEvent.default, {
				orgId: a.orgId,
				agentId: b.agentId,
				target: { type: "web", userId: a.userId },
				text: "x",
				schedule: { type: "immediate" },
			}),
		).rejects.toThrow(/Agent not found in org/);
	});

	it("rejects a web target pointing at another user's thread", async () => {
		const t = newTest();
		const s = await setup(t);
		const stranger = await t.run((ctx) => ctx.db.insert("users", {}));

		await expect(
			create(s, { schedule: { type: "immediate" }, target: { type: "web", userId: stranger } }),
		).rejects.toThrow(/caller's own thread/);
	});

	it("rejects a slack install belonging to another org — the cross-tenant post", async () => {
		const t = newTest();
		const a = await setup(t, "Org A");
		// Org B's workspace. Without the check, A's event would make fireInternal
		// post into it with B's bot token.
		const foreignInstall = await t.run((ctx) =>
			ctx.db.insert("slackInstalls", {
				orgId: "org_B",
				teamId: "T999",
				teamName: "Initech",
				botTokenEnc: { ciphertextB64: "x", nonceB64: "y", kid: "k1" },
				scope: "chat:write",
				botUserId: "B999",
			}),
		);

		await expect(
			create(a, {
				schedule: { type: "immediate" },
				target: { type: "slack", installId: foreignInstall, channelId: "C_EVIL" },
			}),
		).rejects.toThrow(/Slack install not found in org/);
	});
});

describe("M4-T03 cancelEvent", () => {
	it("one-shot pending: cancels the scheduler job and marks the row cancelled", async () => {
		const t = newTest();
		const s = await setup(t);
		const eventId = await create(s, { schedule: { type: "one-shot", at: Date.now() + HOUR } });

		await s.member.mutation(api.events.mutations.cancelEvent.default, { eventId });

		const jobs = await fireJobs(t);
		expect(jobs[0]?.state).toBe("canceled");

		const row = await eventRow(t, eventId);
		expect(row?.status).toBe("cancelled");
		expect(row?.scheduledId).toBeUndefined();
		expect(row?.nextRunAt).toBeUndefined();
	});

	it("periodic: removes the cron from the component and marks the row cancelled", async () => {
		const t = newTest();
		const s = await setup(t);
		const eventId = await create(s, { schedule: { type: "periodic", cron: "0 9 * * *" } });
		expect(await cronOf(t, eventId)).not.toBeNull();

		await s.member.mutation(api.events.mutations.cancelEvent.default, { eventId });

		expect(await cronOf(t, eventId)).toBeNull();
		const row = await eventRow(t, eventId);
		expect(row?.status).toBe("cancelled");
		expect(row?.cronName).toBeUndefined();
	});

	it("is idempotent — the double-click converges instead of throwing", async () => {
		const t = newTest();
		const s = await setup(t);
		const eventId = await create(s, { schedule: { type: "periodic", cron: "0 9 * * *" } });

		await s.member.mutation(api.events.mutations.cancelEvent.default, { eventId });
		await expect(
			s.member.mutation(api.events.mutations.cancelEvent.default, { eventId }),
		).resolves.toBeNull();

		expect((await eventRow(t, eventId))?.status).toBe("cancelled");
	});

	it("cross-tenant: a member of org B cannot cancel org A's event", async () => {
		const t = newTest();
		const a = await setup(t, "Org A");
		const b = await setup(t, "Org B");
		const eventId = await create(a, { schedule: { type: "one-shot", at: Date.now() + HOUR } });

		await expect(
			b.member.mutation(api.events.mutations.cancelEvent.default, { eventId }),
		).rejects.toThrow();

		// And nothing changed: still scheduled, job still pending.
		expect((await eventRow(t, eventId))?.status).toBe("scheduled");
		expect((await fireJobs(t))[0]?.state).toBe("pending");
	});
});

describe("M4-T03 updateEvent", () => {
	it("one-shot → periodic: cancels the old job, registers the cron, swaps handles", async () => {
		const t = newTest();
		const s = await setup(t);
		const eventId = await create(s, { schedule: { type: "one-shot", at: Date.now() + HOUR } });

		await s.member.mutation(api.events.mutations.updateEvent.default, {
			eventId,
			schedule: { type: "periodic", cron: "*/10 * * * *" },
		});

		expect((await fireJobs(t))[0]?.state).toBe("canceled");
		expect((await cronOf(t, eventId))?.schedule).toEqual({
			kind: "cron",
			cronspec: "*/10 * * * *",
			tz: "UTC",
		});

		const row = await eventRow(t, eventId);
		expect(row?.schedule).toEqual({ type: "periodic", cron: "*/10 * * * *" });
		expect(row?.scheduledId).toBeUndefined();
		expect(row?.cronName).toBe(cronNameFor(eventId));
	});

	it("periodic → periodic: re-registers under the same name without throwing on the duplicate", async () => {
		const t = newTest();
		const s = await setup(t);
		const eventId = await create(s, { schedule: { type: "periodic", cron: "0 9 * * *" } });

		// The component throws on duplicate names, so this only passes if update
		// really deletes the old registration before adding the new one.
		await s.member.mutation(api.events.mutations.updateEvent.default, {
			eventId,
			schedule: { type: "periodic", cron: "0 18 * * *" },
		});

		expect((await cronOf(t, eventId))?.schedule).toEqual({
			kind: "cron",
			cronspec: "0 18 * * *",
			tz: "UTC",
		});
	});

	it("text-only edit leaves the scheduling untouched", async () => {
		const t = newTest();
		const s = await setup(t);
		const eventId = await create(s, { schedule: { type: "one-shot", at: Date.now() + HOUR } });
		const before = await eventRow(t, eventId);

		await s.member.mutation(api.events.mutations.updateEvent.default, {
			eventId,
			text: "reworded reminder",
		});

		const after = await eventRow(t, eventId);
		expect(after?.text).toBe("reworded reminder");
		expect(after?.scheduledId).toBe(before?.scheduledId);
		expect((await fireJobs(t))[0]?.state).toBe("pending");
	});

	it("refuses to edit a cancelled event", async () => {
		const t = newTest();
		const s = await setup(t);
		const eventId = await create(s, { schedule: { type: "immediate" } });
		await s.member.mutation(api.events.mutations.cancelEvent.default, { eventId });

		await expect(
			s.member.mutation(api.events.mutations.updateEvent.default, {
				eventId,
				text: "too late",
			}),
		).rejects.toThrow(/cannot update a cancelled event/);
	});
});

describe("M4-T03 end-to-end: the clock actually reaches the agent", () => {
	/**
	 * Everything above asserts bookkeeping; this asserts the *chain*: the
	 * component's registry really resolves our function reference and calls it
	 * when the cron comes due, `fireInternal` really spawns an agent turn, and a
	 * periodic event survives its own firing. If the registration args were
	 * subtly wrong (bad ref, bad args shape), only a test that advances the
	 * clock would notice.
	 *
	 * Time is advanced by ONE tick and drained with
	 * `finishInProgressScheduledFunctions` — never `finishAllScheduledFunctions`,
	 * which chases the component's self-rescheduling forever.
	 */
	it("a periodic cron, once due, fires the event and starts an agent turn", async () => {
		_clearAgentCache();
		_setLanguageModelOverride(mockTextModel("ack, checked."));
		try {
			const t = newTest();
			const s = await setup(t);
			const eventId = await create(s, {
				schedule: { type: "periodic", cron: "*/5 * * * *" },
				text: "check the deploy queue",
			});
			expect((await eventRow(t, eventId))?.lastFiredAt).toBeUndefined();

			// Cross one */5 boundary in a single advance; the whole chain (component
			// tick → fireInternal → handleIncoming) runs inside the window.
			//
			// Harness caveat, learned the hard way: don't try to drain between
			// steps here. convex-test's `finishInProgressScheduledFunctions` polls
			// on the very setTimeout being faked, so both "small steps with drains"
			// and "one timer at a time" deadlock into the test timeout. The single
			// big advance runs the chain to completion.
			await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000);
			// The advance *starts* the chain's jobs; this awaits the ones still in
			// flight (they only need microtasks from here, so it resolves under
			// fake timers). Don't call it on jobs that haven't started — that
			// variant polls the faked setTimeout and deadlocks.
			await t.finishInProgressScheduledFunctions();

			const row = await eventRow(t, eventId);
			expect(row?.lastFiredAt).toBeDefined();
			expect(row?.status).toBe("scheduled"); // periodic survives its firing

			// The turn it spawned: a thread bound to the event's target, holding
			// the synthesized message.
			const threads = await t.run((ctx) => ctx.db.query("threads").collect());
			expect(threads).toHaveLength(1);
			expect(threads[0]?.binding).toEqual({ type: "web", userId: s.userId });
		} finally {
			_setLanguageModelOverride(null);
			_clearAgentCache();
		}
	});
});
