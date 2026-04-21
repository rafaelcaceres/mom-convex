import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { SlackEventDedupeRepository } from "./slackEventDedupe.repository";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("M1-T04 SlackEventDedupeRepository", () => {
	it("recordOrSkip: returns 'recorded' on first call", async () => {
		const t = newTest();
		const res = await t.run(async (ctx) =>
			SlackEventDedupeRepository.recordOrSkip(ctx, {
				eventId: "Ev123",
				now: Date.now(),
			}),
		);
		expect(res).toBe("recorded");
	});

	it("recordOrSkip: returns 'duplicate' on second call with same id", async () => {
		const t = newTest();
		const now = Date.now();
		await t.run(async (ctx) =>
			SlackEventDedupeRepository.recordOrSkip(ctx, { eventId: "Ev1", now }),
		);
		const second = await t.run(async (ctx) =>
			SlackEventDedupeRepository.recordOrSkip(ctx, { eventId: "Ev1", now }),
		);
		expect(second).toBe("duplicate");
	});

	it("recordOrSkip: different eventIds both record", async () => {
		const t = newTest();
		const a = await t.run(async (ctx) =>
			SlackEventDedupeRepository.recordOrSkip(ctx, {
				eventId: "Ev1",
				now: Date.now(),
			}),
		);
		const b = await t.run(async (ctx) =>
			SlackEventDedupeRepository.recordOrSkip(ctx, {
				eventId: "Ev2",
				now: Date.now(),
			}),
		);
		expect(a).toBe("recorded");
		expect(b).toBe("recorded");
	});

	it("clearExpired removes rows older than ttl and keeps fresh ones", async () => {
		const t = newTest();
		const now = 1_000_000_000_000;
		const oldTs = now - 2 * DAY_MS;
		const freshTs = now - HOUR_MS;

		await t.run(async (ctx) => {
			await SlackEventDedupeRepository.recordOrSkip(ctx, {
				eventId: "ev_old",
				now: oldTs,
			});
			await SlackEventDedupeRepository.recordOrSkip(ctx, {
				eventId: "ev_fresh",
				now: freshTs,
			});
		});

		const deleted = await t.run(async (ctx) =>
			SlackEventDedupeRepository.clearExpired(ctx, { now, ttlMs: DAY_MS }),
		);
		expect(deleted).toBe(1);

		const survivorsByEventId = await t.run(async (ctx) => {
			const oldHit = await SlackEventDedupeRepository.getByEventId(ctx, {
				eventId: "ev_old",
			});
			const freshHit = await SlackEventDedupeRepository.getByEventId(ctx, {
				eventId: "ev_fresh",
			});
			return {
				old: oldHit !== null,
				fresh: freshHit !== null,
			};
		});
		expect(survivorsByEventId).toEqual({ old: false, fresh: true });
	});

	it("clearExpired is idempotent — running again with same inputs returns 0", async () => {
		const t = newTest();
		const now = Date.now();
		await t.run(async (ctx) =>
			SlackEventDedupeRepository.recordOrSkip(ctx, {
				eventId: "ev",
				now,
			}),
		);
		const firstSweep = await t.run(async (ctx) =>
			SlackEventDedupeRepository.clearExpired(ctx, { now, ttlMs: DAY_MS }),
		);
		const secondSweep = await t.run(async (ctx) =>
			SlackEventDedupeRepository.clearExpired(ctx, { now, ttlMs: DAY_MS }),
		);
		expect(firstSweep).toBe(0);
		expect(secondSweep).toBe(0);
	});
});
