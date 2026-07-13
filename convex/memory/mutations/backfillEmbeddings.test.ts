import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { mockEmbeddingModel } from "../../../test/_helpers/embedding";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { _setEmbeddingModelOverride } from "../_libs/embedding";

/**
 * The backfill exists for exactly one population: rows written before the M3-T02
 * trigger shipped, which have no vector and — because the trigger only fires on
 * insert or a content change — would never get one. They look fine in the
 * dashboard and are invisible to search, so the tests here pin both halves: the
 * stranded rows get picked up, and the healthy ones don't get re-embedded for
 * nothing.
 */

/** A row as it existed before M3-T02: content, no vector. Written raw, so no trigger fires. */
async function legacyMemory(t: ReturnType<typeof newTest>, userId: Id<"users">, content: string) {
	return t.run((ctx) =>
		ctx.db.insert("memory", {
			orgId: "org_A",
			scope: "org",
			content,
			alwaysOn: false,
			updatedBy: userId,
			updatedAt: Date.now(),
		}),
	);
}

describe("M3-T04 memory backfillEmbeddings", () => {
	beforeEach(() => {
		vi.useFakeTimers({
			toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
		});
		_setEmbeddingModelOverride(mockEmbeddingModel());
	});

	afterEach(() => {
		vi.useRealTimers();
		_setEmbeddingModelOverride(mockEmbeddingModel());
	});

	it("embeds rows the trigger can never reach on its own", async () => {
		const t = newTest();
		const userId = await t.run((ctx) => ctx.db.insert("users", {}));
		const id = await legacyMemory(t, userId, "written before the trigger existed");

		// Read the whole doc: `undefined` returned across the `t.run` boundary comes
		// back as `null`, which would make this assertion about the wrong thing.
		const before = await t.run((ctx) => ctx.db.get(id));
		expect(before?.embedding).toBeUndefined();

		const { scheduled } = await t.mutation(
			internal.memory.mutations.backfillEmbeddings.default,
			{},
		);
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(scheduled).toBe(1);
		const after = await t.run((ctx) => ctx.db.get(id));
		expect(after?.embedding).toHaveLength(1536);
	});

	it("leaves already-embedded rows alone, so a re-run is free", async () => {
		const t = newTest();
		const userId = await t.run((ctx) => ctx.db.insert("users", {}));
		await legacyMemory(t, userId, "one");
		await legacyMemory(t, userId, "two");

		await t.mutation(internal.memory.mutations.backfillEmbeddings.default, {});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const second = await t.mutation(internal.memory.mutations.backfillEmbeddings.default, {});
		expect(second.scheduled).toBe(0);
	});

	it("respects the limit so a large backlog drains across runs", async () => {
		const t = newTest();
		const userId = await t.run((ctx) => ctx.db.insert("users", {}));
		for (let i = 0; i < 5; i++) await legacyMemory(t, userId, `row ${i}`);

		const first = await t.mutation(internal.memory.mutations.backfillEmbeddings.default, {
			limit: 2,
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		const second = await t.mutation(internal.memory.mutations.backfillEmbeddings.default, {
			limit: 10,
		});

		expect(first.scheduled).toBe(2);
		expect(second.scheduled).toBe(3);
	});
});
