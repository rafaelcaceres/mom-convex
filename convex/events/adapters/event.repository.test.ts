import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { Id } from "../../_generated/dataModel";
import { type Event, type EventSchedule, type NewEvent, nextRunFor } from "../domain/event.model";
import { EventRepository } from "./event.repository";

/**
 * M4-T01 — the repository against a real (test) database. The domain tests cover
 * the rules; these cover the *indexes*, which is where a repository can be wrong
 * in ways a pure test cannot see: a range that quietly includes a cancelled row,
 * an ordering that depends on insertion order.
 *
 * Harness note: `t.run` serializes whatever its callback returns, and an
 * `EventAgg` is a class, not a Convex value. Every helper below therefore
 * unwraps to `getModel()` *inside* the transaction.
 */

type Repo = typeof EventRepository;
type T = ReturnType<typeof newTest>;

const NOW = Date.parse("2026-07-12T12:00:00Z");
const HOUR = 3_600_000;

function draft(
	over: Partial<NewEvent> & { agentId: Id<"agents">; schedule: EventSchedule },
): NewEvent {
	return {
		orgId: "org_A",
		target: { type: "slack", installId: "inst_1", channelId: "C_ENG" },
		text: "check the deploy queue",
		status: "scheduled",
		createdAt: NOW,
		nextRunAt: nextRunFor(over.schedule, NOW),
		...over,
	};
}

async function makeAgent(t: T, orgId = "org_A"): Promise<Id<"agents">> {
	return t.run((ctx) =>
		ctx.db.insert("agents", {
			orgId,
			slug: `agent-${orgId}`,
			name: "Default",
			systemPrompt: "You are helpful.",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
			isDefault: true,
			toolsAllowlist: [],
		}),
	);
}

/** Seed events and hand back their ids, in the order given. */
async function seed(t: T, drafts: NewEvent[]): Promise<Id<"events">[]> {
	return t.run(async (ctx) => {
		const ids: Id<"events">[] = [];
		for (const d of drafts) {
			const agg = await EventRepository.create(ctx, d);
			ids.push(agg.getModel()._id);
		}
		return ids;
	});
}

const readOne = (t: T, id: Id<"events">): Promise<Event | null> =>
	t.run(async (ctx) => (await EventRepository.get(ctx, id))?.getModel() ?? null);

const list = (
	t: T,
	fn: (ctx: Parameters<Repo["listByAgent"]>[0]) => Promise<{ getModel(): Event }[]>,
) => t.run(async (ctx) => (await fn(ctx)).map((a) => a.getModel()));

/** Mutate one event through its aggregate, in a transaction. */
const mutate = (t: T, id: Id<"events">, fn: (agg: Awaited<ReturnType<Repo["get"]>>) => void) =>
	t.run(async (ctx) => {
		const agg = await EventRepository.get(ctx, id);
		if (!agg) throw new Error("event vanished");
		fn(agg);
		await EventRepository.save(ctx, agg);
	});

describe("M4-T01 EventRepository", () => {
	it("creates an event and reads it back by id", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const [id] = await seed(t, [
			draft({ agentId, schedule: { type: "one-shot", at: NOW + HOUR } }),
		]);

		const found = await readOne(t, id as Id<"events">);
		expect(found?.text).toBe("check the deploy queue");
		expect(found?.nextRunAt).toBe(NOW + HOUR);
		expect(found?.status).toBe("scheduled");
		expect(found?.schedule).toEqual({ type: "one-shot", at: NOW + HOUR });
	});

	it("persists the scheduler handle so a cancel can reach the pending run", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const [id] = await seed(t, [
			draft({ agentId, schedule: { type: "one-shot", at: NOW + HOUR } }),
		]);

		await mutate(t, id as Id<"events">, (agg) => agg?.setScheduledId("job_abc"));

		expect((await readOne(t, id as Id<"events">))?.scheduledId).toBe("job_abc");
	});

	it("listByAgent returns the agent's events and nobody else's", async () => {
		const t = newTest();
		const mine = await makeAgent(t);
		const theirs = await makeAgent(t, "org_B");

		await seed(t, [
			draft({ agentId: mine, schedule: { type: "immediate" } }),
			draft({ agentId: mine, schedule: { type: "one-shot", at: NOW + HOUR } }),
			draft({ agentId: theirs, orgId: "org_B", schedule: { type: "immediate" } }),
		]);

		const rows = await list(t, (ctx) => EventRepository.listByAgent(ctx, mine));
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.agentId === mine)).toBe(true);
	});

	it("listByAgent includes cancelled events — the UI list needs the history", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const [, deadId] = await seed(t, [
			draft({ agentId, schedule: { type: "one-shot", at: NOW + HOUR } }),
			draft({ agentId, text: "cancelled one", schedule: { type: "immediate" } }),
		]);

		await mutate(t, deadId as Id<"events">, (agg) => agg?.cancel());

		const rows = await list(t, (ctx) => EventRepository.listByAgent(ctx, agentId));
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.status).sort()).toEqual(["cancelled", "scheduled"]);
	});

	it("listActiveByOrg hides cancelled events and other tenants", async () => {
		const t = newTest();
		const a = await makeAgent(t, "org_A");
		const b = await makeAgent(t, "org_B");

		const [, cancelledId] = await seed(t, [
			draft({ agentId: a, schedule: { type: "one-shot", at: NOW + HOUR } }),
			draft({ agentId: a, schedule: { type: "immediate" } }),
			draft({ agentId: b, orgId: "org_B", schedule: { type: "immediate" } }),
		]);
		await mutate(t, cancelledId as Id<"events">, (agg) => agg?.cancel());

		const rows = await list(t, (ctx) => EventRepository.listActiveByOrg(ctx, "org_A"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.orgId).toBe("org_A");
		expect(rows[0]?.status).toBe("scheduled");
	});

	it("listReady returns only events that are live AND due", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);

		const [, , cancelledId] = await seed(t, [
			draft({ agentId, text: "due", schedule: { type: "one-shot", at: NOW + HOUR } }),
			draft({ agentId, text: "later", schedule: { type: "one-shot", at: NOW + 5 * HOUR } }),
			// Due, but cancelled — the row `listReady` must never hand back, because
			// firing it would deliver a reminder the user explicitly called off.
			draft({ agentId, text: "cancelled", schedule: { type: "one-shot", at: NOW + HOUR } }),
		]);
		await mutate(t, cancelledId as Id<"events">, (agg) => agg?.cancel());

		const ready = await list(t, (ctx) => EventRepository.listReady(ctx, NOW + 2 * HOUR));
		expect(ready.map((r) => r.text)).toEqual(["due"]);
	});

	it("listReady is empty before anything is due", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		await seed(t, [draft({ agentId, schedule: { type: "one-shot", at: NOW + 5 * HOUR } })]);

		expect(await list(t, (ctx) => EventRepository.listReady(ctx, NOW))).toEqual([]);
	});

	it("a fired periodic event leaves the ready set, then comes back around", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const [id] = await seed(t, [
			draft({
				agentId,
				text: "every 5 min",
				schedule: { type: "periodic", cron: "*/5 * * * *" },
			}),
		]);
		const due = (await readOne(t, id as Id<"events">))?.nextRunAt as number;

		expect(await list(t, (ctx) => EventRepository.listReady(ctx, due))).toHaveLength(1);

		await mutate(t, id as Id<"events">, (agg) => agg?.markFired(due));

		// Rolled forward: no longer due at the instant it just ran…
		expect(await list(t, (ctx) => EventRepository.listReady(ctx, due))).toHaveLength(0);
		// …but still live, and due again at the next tick.
		const again = await list(t, (ctx) => EventRepository.listReady(ctx, due + 10 * 60_000));
		expect(again).toHaveLength(1);
		expect(again[0]?.lastFiredAt).toBe(due);
		expect(again[0]?.status).toBe("scheduled");
	});

	it("a fired one-shot is done and never appears in the ready set again", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		const [id] = await seed(t, [
			draft({ agentId, schedule: { type: "one-shot", at: NOW + HOUR } }),
		]);

		await mutate(t, id as Id<"events">, (agg) => agg?.markFired(NOW + HOUR));

		expect((await readOne(t, id as Id<"events">))?.status).toBe("done");
		// Far in the future, when everything that could be due is due.
		expect(await list(t, (ctx) => EventRepository.listReady(ctx, NOW + 100 * HOUR))).toEqual([]);
	});

	it("listReady honours its limit so a backlog drains across sweeps", async () => {
		const t = newTest();
		const agentId = await makeAgent(t);
		await seed(
			t,
			Array.from({ length: 5 }, (_, i) =>
				draft({ agentId, text: `evt ${i}`, schedule: { type: "one-shot", at: NOW + HOUR } }),
			),
		);

		const first = await list(t, (ctx) => EventRepository.listReady(ctx, NOW + 2 * HOUR, 2));
		expect(first).toHaveLength(2);
	});
});
