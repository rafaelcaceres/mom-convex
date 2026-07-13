import { describe, expect, it, vi } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	type EventSchedule,
	type EventTarget,
	type NewEvent,
	nextRunFor,
} from "../domain/event.model";
import { synthesizeEventMessage } from "./fireInternal";

/**
 * M4-T02 — `fireInternal`, the single landing point for every due event. The
 * five scenarios from the spec, exercised through the real mutation against
 * real domain code; the only thing not real is the clock.
 *
 * Dispatch is asserted on the `_scheduled_functions` system table rather than
 * by draining the queue into `handleIncoming`: what fire *owes* is an enqueued
 * call with the right args — running the agent behind it is M2's contract,
 * already covered by the M2 smoke, and would drag an LLM mock into every case
 * here.
 */

const NOW = Date.parse("2026-07-13T12:00:00Z");
const HOUR = 3_600_000;

type T = ReturnType<typeof newTest>;

async function makeAgent(t: T, orgId = "org_A"): Promise<Id<"agents">> {
	return t.run((ctx) =>
		ctx.db.insert("agents", {
			orgId,
			slug: "default",
			name: "Default",
			systemPrompt: "You are helpful.",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
			isDefault: true,
			toolsAllowlist: [],
		}),
	);
}

async function makeUser(t: T): Promise<Id<"users">> {
	return t.run((ctx) => ctx.db.insert("users", {}));
}

/** A live event row, written raw — scheduling handles are M4-T03's business. */
async function seedEvent(
	t: T,
	args: {
		agentId: Id<"agents">;
		target: EventTarget;
		schedule: EventSchedule;
		orgId?: string;
		text?: string;
		status?: NewEvent["status"];
	},
): Promise<Id<"events">> {
	return t.run((ctx) =>
		ctx.db.insert("events", {
			orgId: args.orgId ?? "org_A",
			agentId: args.agentId,
			target: args.target,
			text: args.text ?? "check the deploy queue",
			schedule: args.schedule,
			status: args.status ?? "scheduled",
			createdAt: NOW,
			nextRunAt: nextRunFor(args.schedule, NOW),
		}),
	);
}

const fire = (t: T, eventId: Id<"events">) =>
	t.mutation(internal.events.mutations.fireInternal.default, { eventId });

/** Pending `handleIncoming` dispatches, with their args, straight off the scheduler. */
async function dispatches(t: T) {
	return t.run(async (ctx) => {
		const jobs = await ctx.db.system.query("_scheduled_functions").collect();
		return jobs
			.filter((j) => j.name.includes("handleIncoming"))
			.map((j) => ({ state: j.state.kind, args: j.args[0] as Record<string, unknown> }));
	});
}

const threadsOf = (t: T, orgId: string) =>
	t.run((ctx) =>
		ctx.db
			.query("threads")
			.filter((q) => q.eq(q.field("orgId"), orgId))
			.collect(),
	);

describe("M4-T02 fireInternal", () => {
	it("immediate: resolves a thread from the target and enqueues the synthesized message", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const userId = await makeUser(t);
		const eventId = await seedEvent(t, {
			agentId,
			target: { type: "web", userId },
			schedule: { type: "immediate" },
			text: "kick off the daily digest",
		});

		await fire(t, eventId);

		const threads = await threadsOf(t, "org_A");
		expect(threads).toHaveLength(1);
		expect(threads[0]?.binding).toEqual({ type: "web", userId });

		const pending = await dispatches(t);
		expect(pending).toHaveLength(1);
		expect(pending[0]?.args).toMatchObject({
			orgId: "org_A",
			threadId: threads[0]?._id,
			userMessage: { text: "[EVENT:immediate:now] kick off the daily digest" },
		});
		// No senderId: an event has no human, and inventing one would poison
		// sender-identity hydration downstream.
		expect((pending[0]?.args.userMessage as Record<string, unknown>).senderId).toBeUndefined();

		const event = await t.run((ctx) => ctx.db.get(eventId));
		expect(event?.status).toBe("done");
		expect(event?.lastFiredAt).toBeDefined();
	});

	it("reuses an existing thread instead of minting one per fire", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const userId = await makeUser(t);

		// The binding already has a thread — a prior event, or the user's own chat.
		await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding: { type: "web", userId },
		});

		const eventId = await seedEvent(t, {
			agentId,
			target: { type: "web", userId },
			schedule: { type: "immediate" },
		});
		await fire(t, eventId);

		expect(await threadsOf(t, "org_A")).toHaveLength(1);
	});

	it("one-shot: fires once, row survives as done — the UI's history depends on it", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const userId = await makeUser(t);
		const at = NOW + HOUR;
		const eventId = await seedEvent(t, {
			agentId,
			target: { type: "web", userId },
			schedule: { type: "one-shot", at },
			text: "remind me about the retro",
		});

		await fire(t, eventId);

		const pending = await dispatches(t);
		expect(pending).toHaveLength(1);
		expect((pending[0]?.args.userMessage as Record<string, unknown>).text).toBe(
			`[EVENT:one-shot:${new Date(at).toISOString()}] remind me about the retro`,
		);

		const event = await t.run((ctx) => ctx.db.get(eventId));
		expect(event).not.toBeNull(); // kept, not deleted — deliberate spec deviation
		expect(event?.status).toBe("done");
		expect(event?.nextRunAt).toBeUndefined();
	});

	it("periodic: stays scheduled, records lastFiredAt, rolls nextRunAt forward", async () => {
		vi.useFakeTimers({
			toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
		});
		vi.setSystemTime(NOW);
		try {
			const t = newTest();
			const agentId = await makeAgent(t);
			const userId = await makeUser(t);
			const eventId = await seedEvent(t, {
				agentId,
				target: { type: "web", userId },
				schedule: { type: "periodic", cron: "*/5 * * * *" },
			});

			await fire(t, eventId);

			const event = await t.run((ctx) => ctx.db.get(eventId));
			expect(event?.status).toBe("scheduled");
			expect(event?.lastFiredAt).toBe(NOW);
			// Rolled forward from the *actual* fire time — a delayed run must not
			// leave nextRunAt in the past and trigger catch-up fires.
			expect(event?.nextRunAt).toBeGreaterThan(NOW);

			expect(await dispatches(t)).toHaveLength(1);
			expect((await dispatches(t))[0]?.args.userMessage).toEqual({
				text: "[EVENT:periodic:*/5 * * * *] check the deploy queue",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("a cancelled event is a logged no-op: no thread, no dispatch, no throw", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const userId = await makeUser(t);
		const eventId = await seedEvent(t, {
			agentId,
			target: { type: "web", userId },
			schedule: { type: "immediate" },
			status: "cancelled",
		});

		// This is the cancel-races-in-flight-job path: the scheduler already
		// committed to calling us, and the status re-read is what stops delivery.
		await expect(fire(t, eventId)).resolves.toBeNull();

		expect(await threadsOf(t, "org_A")).toHaveLength(0);
		expect(await dispatches(t)).toHaveLength(0);
		const event = await t.run((ctx) => ctx.db.get(eventId));
		expect(event?.status).toBe("cancelled");
		expect(event?.lastFiredAt).toBeUndefined();
	});

	it("slack target whose install is gone: warns, marks fired, never throws", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const eventId = await seedEvent(t, {
			agentId,
			// An installId that was never (or is no longer) a row — the workspace
			// uninstalled the app after the event was created.
			target: { type: "slack", installId: "inst_gone", channelId: "C_ENG" },
			schedule: { type: "immediate" },
		});

		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await expect(fire(t, eventId)).resolves.toBeNull();

			expect(await threadsOf(t, "org_A")).toHaveLength(0);
			expect(await dispatches(t)).toHaveLength(0);

			// Marked fired anyway: throwing would make the scheduler retry a delivery
			// that can only fail again.
			const event = await t.run((ctx) => ctx.db.get(eventId));
			expect(event?.status).toBe("done");

			const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
			expect(logged).toContain("slack_install_missing");
			expect(logged).toContain(eventId);
		} finally {
			warn.mockRestore();
		}
	});

	it("slack target with a live install: resolves the channel thread and dispatches", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const installId = await t.run((ctx) =>
			ctx.db.insert("slackInstalls", {
				orgId: "org_A",
				teamId: "T123",
				teamName: "Acme",
				botTokenEnc: { ciphertextB64: "x", nonceB64: "y", kid: "k1" },
				scope: "chat:write",
				botUserId: "B123",
			}),
		);
		const eventId = await seedEvent(t, {
			agentId,
			target: { type: "slack", installId, channelId: "C_ENG" },
			schedule: { type: "immediate" },
		});

		await fire(t, eventId);

		const threads = await threadsOf(t, "org_A");
		expect(threads).toHaveLength(1);
		expect(threads[0]?.binding).toMatchObject({ type: "slack", installId, channelId: "C_ENG" });
		expect(await dispatches(t)).toHaveLength(1);
		expect((await t.run((ctx) => ctx.db.get(eventId)))?.status).toBe("done");
	});
});

describe("M4-T02 synthesizeEventMessage", () => {
	it("frames each schedule type the way pi-mom's agent expects", () => {
		expect(synthesizeEventMessage({ schedule: { type: "immediate" }, text: "go" })).toBe(
			"[EVENT:immediate:now] go",
		);
		expect(synthesizeEventMessage({ schedule: { type: "one-shot", at: NOW }, text: "go" })).toBe(
			"[EVENT:one-shot:2026-07-13T12:00:00.000Z] go",
		);
		expect(
			synthesizeEventMessage({ schedule: { type: "periodic", cron: "0 9 * * 1" }, text: "go" }),
		).toBe("[EVENT:periodic:0 9 * * 1] go");
	});
});
