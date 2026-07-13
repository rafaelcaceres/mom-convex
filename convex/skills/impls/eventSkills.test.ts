import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { createAgentThread } from "../../agents/adapters/threadBridge";
import { crons } from "../../events/_libs/cronsClient";
import { cronNameFor } from "../../events/_libs/schedule";
import { seedSkillCatalog } from "../_seeds";

/**
 * F-10 — `event.create` / `event.list` / `event.cancel`, driven through the
 * real dispatcher (`skills.actions.invoke`), because the property that matters
 * lives between the pieces: the model supplies WHAT and WHEN, and WHERE is
 * derived from the thread's binding on the server. A unit test of the impl
 * alone would never catch the dispatcher handing it the wrong scope.
 *
 * Whole-file fake timers, as in the events lifecycle suite: `event.create`
 * with `afterMinutes` arms real `setTimeout`s otherwise, which fire mid-test
 * against convex-test's single transaction manager and produce flaky
 * "Transaction already committed" noise.
 */

const NOW = Date.parse("2026-07-14T12:00:00Z");
const HOUR = 3_600_000;

type T = ReturnType<typeof newTest>;

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
	});
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

async function setup(t: T) {
	await t.run(async (ctx) => {
		await seedSkillCatalog(ctx);
	});
	const userId = await t.run((ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: userId });
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: "Acme",
	});
	const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;
	return { owner, userId, orgId, agentId };
}

/** A Slack thread carrying a parentTs, so target derivation has something to drop. */
async function slackThread(t: T, clause: { orgId: string; agentId: Id<"agents"> }) {
	const agentThreadId = await t.run((ctx) => createAgentThread(ctx, { title: "eng" }));
	const threadId = await t.run((ctx) =>
		ctx.db.insert("threads", {
			orgId: clause.orgId,
			agentId: clause.agentId,
			agentThreadId,
			bindingKey: "slack:inst_1:C_ENG:1.1",
			binding: {
				type: "slack",
				installId: "inst_1",
				channelId: "C_ENG",
				threadTs: "1.1",
				parentTs: "9.9",
			},
		}),
	);
	return { threadId, agentThreadId };
}

type Scope = {
	orgId: string;
	agentId: Id<"agents">;
	threadId: Id<"threads">;
	agentThreadId: string;
};

async function invokeSkill(t: T, skillKey: string, scope: Scope, args: Record<string, unknown>) {
	const raw = (await t.action(internal.skills.actions.invoke.default, {
		skillKey,
		args,
		scope: { ...scope, userId: null },
		toolCallId: "tc_events",
	})) as { isError?: boolean; content: Array<{ type: string; text: string }> };
	return raw;
}

async function invokeOk<TOut>(
	t: T,
	skillKey: string,
	scope: Scope,
	args: Record<string, unknown>,
): Promise<TOut> {
	const raw = await invokeSkill(t, skillKey, scope, args);
	expect(raw.isError).not.toBe(true);
	return JSON.parse(raw.content[0]?.text ?? "{}") as TOut;
}

type CreateResult = {
	created: true;
	eventId: Id<"events">;
	scheduleType: string;
	nextRunAt?: string;
};

describe("F-10 event.create", () => {
	it("afterMinutes: creates a one-shot targeted at THIS conversation, parentTs dropped", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const scope = { orgId, agentId, ...(await slackThread(t, { orgId, agentId })) };

		const result = await invokeOk<CreateResult>(t, "event.create", scope, {
			text: "lembrar de revisar o deploy",
			afterMinutes: 60,
		});

		expect(result.created).toBe(true);
		expect(result.scheduleType).toBe("one-shot");
		expect(result.nextRunAt).toBe(new Date(NOW + HOUR).toISOString());

		const event = await t.run((ctx) => ctx.db.get(result.eventId));
		expect(event?.schedule).toEqual({ type: "one-shot", at: NOW + HOUR });
		// WHERE was derived from the thread, not from the model — and the current
		// turn's reply anchor (parentTs) did not leak into the future fire.
		expect(event?.target).toEqual({
			type: "slack",
			installId: "inst_1",
			channelId: "C_ENG",
			threadTs: "1.1",
		});
		expect(event?.orgId).toBe(orgId);
		expect(event?.scheduledId).toBeDefined();
	});

	it("at (ISO UTC): creates a one-shot at that instant", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const scope = { orgId, agentId, ...(await slackThread(t, { orgId, agentId })) };

		const at = "2026-07-14T15:30:00Z";
		const result = await invokeOk<CreateResult>(t, "event.create", scope, {
			text: "reunião de retro",
			at,
		});

		const event = await t.run((ctx) => ctx.db.get(result.eventId));
		expect(event?.schedule).toEqual({ type: "one-shot", at: Date.parse(at) });
	});

	it("cron: registers a periodic in the crons component", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const scope = { orgId, agentId, ...(await slackThread(t, { orgId, agentId })) };

		const result = await invokeOk<CreateResult>(t, "event.create", scope, {
			text: "checar a fila de deploy",
			cron: "*/5 * * * *",
		});

		expect(result.scheduleType).toBe("periodic");
		const registered = await t.run((ctx) => crons.get(ctx, { name: cronNameFor(result.eventId) }));
		expect(registered?.schedule).toEqual({ kind: "cron", cronspec: "*/5 * * * *" });
	});

	it("web thread: target derives to the user's own web binding", async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const agentThreadId = await t.run((ctx) => createAgentThread(ctx, { userId }));
		const threadId = await t.run((ctx) =>
			ctx.db.insert("threads", {
				orgId,
				agentId,
				agentThreadId,
				bindingKey: `web:${userId}`,
				binding: { type: "web", userId },
			}),
		);

		const result = await invokeOk<CreateResult>(
			t,
			"event.create",
			{ orgId, agentId, threadId, agentThreadId },
			{ text: "beber água", afterMinutes: 30 },
		);

		const event = await t.run((ctx) => ctx.db.get(result.eventId));
		expect(event?.target).toEqual({ type: "web", userId });
	});

	it("rejects zero or two time shapes, non-UTC timestamps, and past instants", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const scope = { orgId, agentId, ...(await slackThread(t, { orgId, agentId })) };

		const none = await invokeSkill(t, "event.create", scope, { text: "x" });
		expect(none.isError).toBe(true);

		const two = await invokeSkill(t, "event.create", scope, {
			text: "x",
			afterMinutes: 5,
			cron: "* * * * *",
		});
		expect(two.isError).toBe(true);

		// No Z suffix — zod's .datetime() requires UTC, by design: an unlabelled
		// local time is exactly the three-hours-off bug the clock section warns about.
		const local = await invokeSkill(t, "event.create", scope, {
			text: "x",
			at: "2026-07-14T15:30:00",
		});
		expect(local.isError).toBe(true);

		const past = await invokeSkill(t, "event.create", scope, {
			text: "x",
			at: "2020-01-01T00:00:00Z",
		});
		expect(past.isError).toBe(true);
	});
});

describe("F-10 event.list / event.cancel", () => {
	it("list shows what create made; cancel withdraws it and list reflects that", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const scope = { orgId, agentId, ...(await slackThread(t, { orgId, agentId })) };

		const created = await invokeOk<CreateResult>(t, "event.create", scope, {
			text: "checar a fila",
			cron: "0 9 * * *",
		});

		const listed = await invokeOk<{ events: Array<Record<string, unknown>> }>(
			t,
			"event.list",
			scope,
			{},
		);
		expect(listed.events).toHaveLength(1);
		expect(listed.events[0]).toMatchObject({
			eventId: created.eventId,
			text: "checar a fila",
			status: "scheduled",
		});

		const cancelled = await invokeOk<{ cancelled: boolean; status: string }>(
			t,
			"event.cancel",
			scope,
			{ eventId: created.eventId },
		);
		expect(cancelled).toEqual({ cancelled: true, status: "cancelled" });

		// The engine really let go — not just the row.
		expect(await t.run((ctx) => crons.get(ctx, { name: cronNameFor(created.eventId) }))).toBeNull();

		const after = await invokeOk<{ events: Array<Record<string, unknown>> }>(
			t,
			"event.list",
			scope,
			{},
		);
		expect(after.events[0]?.status).toBe("cancelled");
	});

	it("cancel is idempotent through the skill too", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const scope = { orgId, agentId, ...(await slackThread(t, { orgId, agentId })) };
		const created = await invokeOk<CreateResult>(t, "event.create", scope, {
			text: "x",
			afterMinutes: 10,
		});

		await invokeOk(t, "event.cancel", scope, { eventId: created.eventId });
		const second = await invokeOk<{ cancelled: boolean }>(t, "event.cancel", scope, {
			eventId: created.eventId,
		});
		expect(second.cancelled).toBe(true);
	});

	it("cannot see or cancel another org's events — and the error doesn't leak existence", async () => {
		const t = newTest();
		const a = await setup(t);
		// Second org, second agent, one event of its own.
		const userB = await t.run((ctx) => ctx.db.insert("users", {}));
		const ownerB = t.withIdentity({ subject: userB });
		const { orgId: orgB } = await ownerB.mutation(
			api.tenancy.mutations.completeOnboarding.default,
			{
				orgName: "Initech",
			},
		);
		const agentsB = await ownerB.query(api.agents.queries.listByOrg.default, { orgId: orgB });
		const agentB = agentsB[0]?._id as Id<"agents">;
		const scopeB = {
			orgId: orgB,
			agentId: agentB,
			...(await slackThread(t, { orgId: orgB, agentId: agentB })),
		};
		const foreign = await invokeOk<CreateResult>(t, "event.create", scopeB, {
			text: "segredo da initech",
			afterMinutes: 30,
		});

		const scopeA = {
			orgId: a.orgId,
			agentId: a.agentId,
			...(await slackThread(t, { orgId: a.orgId, agentId: a.agentId })),
		};

		// A's list never shows B's event…
		const listA = await invokeOk<{ events: Array<{ eventId: string }> }>(
			t,
			"event.list",
			scopeA,
			{},
		);
		expect(listA.events.map((e) => e.eventId)).not.toContain(foreign.eventId);

		// …and cancelling it by id fails indistinguishably from a bogus id.
		const raw = await invokeSkill(t, "event.cancel", scopeA, { eventId: foreign.eventId });
		expect(raw.isError).toBe(true);
		expect(raw.content[0]?.text).toContain("Event not found");

		// B's event is untouched.
		expect((await t.run((ctx) => ctx.db.get(foreign.eventId)))?.status).toBe("scheduled");
	});
});
