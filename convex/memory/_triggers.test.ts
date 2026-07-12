import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTest } from "../../test/_helpers/convex";
import { fakeEmbeddingFor, mockEmbeddingModel } from "../../test/_helpers/embedding";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { EMBEDDING_DIMENSIONS, _setEmbeddingModelOverride } from "./_libs/embedding";

/**
 * M3-T02 — the `memory` trigger schedules embedding work; it never embeds
 * inline. These tests pin the *scheduling* decisions (which writes deserve a
 * fresh vector) separately from the write-back CAS, which lives in
 * `mutations/setEmbeddingInternal.test.ts`.
 *
 * The loop-guard case is the load-bearing one: the vector lands via a patch on
 * the very table the trigger watches, so a trigger that doesn't compare content
 * re-fires forever.
 */

async function setupOrg(t: ReturnType<typeof newTest>) {
	const ownerUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: ownerUserId });
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: "Acme",
	});
	const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;
	return { owner, orgId, agentId };
}

/**
 * Embed jobs that have not run yet. `_scheduled_functions` retains *completed*
 * jobs (state `success` / `failed`), so filtering by name alone would count
 * history and every assertion here would read as "still scheduled".
 */
async function pendingEmbedJobs(t: ReturnType<typeof newTest>) {
	return t.run(async (ctx) => {
		const jobs = await ctx.db.system.query("_scheduled_functions").collect();
		return jobs
			.filter((j) => j.name.includes("memory/actions/embed"))
			.filter((j) => j.state.kind === "pending" || j.state.kind === "inProgress")
			.map((j) => ({ args: j.args[0] as { memoryId: string; content: string } }));
	});
}

describe("M3-T02 memory embedding trigger", () => {
	beforeEach(() => {
		// Fake timers are what make `finishAllScheduledFunctions(vi.runAllTimers)`
		// actually drain. `toFake` is deliberately narrow — faking `nextTick` /
		// `queueMicrotask` stalls convex-test's own async I/O and surfaces as
		// bogus "Transaction not started" errors from inside the scheduled action.
		vi.useFakeTimers({
			toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
		});
		_setEmbeddingModelOverride(mockEmbeddingModel());
	});

	afterEach(() => {
		vi.useRealTimers();
		_setEmbeddingModelOverride(null);
	});

	it("insert schedules an embed for the new content", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);

		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "The internal project code-name is Zephyr",
		});

		const jobs = await pendingEmbedJobs(t);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.args).toMatchObject({
			memoryId: id,
			content: "The internal project code-name is Zephyr",
		});
	});

	it("update that changes content schedules a fresh embed", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);

		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "original",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		await owner.mutation(api.memory.mutations.upsertMemory.default, {
			id,
			orgId,
			scope: "org",
			content: "revised",
		});

		const jobs = await pendingEmbedJobs(t);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.args.content).toBe("revised");
	});

	it("update that leaves content alone does NOT schedule an embed", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);

		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "stable",
			alwaysOn: false,
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Same content, flips alwaysOn — the existing vector still describes it,
		// so burning an embedding call here would be pure waste.
		await owner.mutation(api.memory.mutations.upsertMemory.default, {
			id,
			orgId,
			scope: "org",
			content: "stable",
			alwaysOn: true,
		});

		expect(await pendingEmbedJobs(t)).toHaveLength(0);
	});

	it("the embedding write-back does not re-trigger (no infinite loop)", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);

		await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "loop check",
		});

		// Draining runs the embed action, which patches `embedding` back onto the
		// row. Without the content comparison in the trigger, that patch enqueues
		// another embed and this drain never settles.
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await pendingEmbedJobs(t)).toHaveLength(0);
	});

	it("end-to-end: the vector lands on the row after the scheduled action runs", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);

		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "embed me",
		});

		// Eventual consistency: the row is readable immediately, but not yet
		// searchable.
		const before = await t.run((ctx) => ctx.db.get(id));
		expect(before?.embedding).toBeUndefined();

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const after = await t.run((ctx) => ctx.db.get(id));
		expect(after?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
		// The vector is the one derived from *this* row's content, not a neighbour's.
		expect(after?.embedding).toEqual(fakeEmbeddingFor("embed me"));
		expect(after?.content).toBe("embed me");
	});

	it("re-embeds on edit: the stored vector tracks the new content", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);

		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "before",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(await t.run((ctx) => ctx.db.get(id).then((r) => r?.embedding))).toEqual(
			fakeEmbeddingFor("before"),
		);

		await owner.mutation(api.memory.mutations.upsertMemory.default, {
			id,
			orgId,
			scope: "org",
			content: "after",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		expect(await t.run((ctx) => ctx.db.get(id).then((r) => r?.embedding))).toEqual(
			fakeEmbeddingFor("after"),
		);
	});

	it("delete schedules nothing — the vector dies with the row", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);

		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "ephemeral",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		await owner.mutation(api.memory.mutations.deleteMemory.default, { id });

		expect(await pendingEmbedJobs(t)).toHaveLength(0);
		expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
	});
});
