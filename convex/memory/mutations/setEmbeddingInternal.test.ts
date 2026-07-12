import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { EMBEDDING_DIMENSIONS } from "../_libs/embedding";

/**
 * M3-T02 — write-back CAS. The guard here is what keeps a slow embedding call
 * from attaching a vector for text the row no longer holds; a stale vector on
 * fresh content makes the row findable by the *wrong* query, which is worse
 * than no vector at all.
 */

const VECTOR = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);

async function setupMemory(t: ReturnType<typeof newTest>, content: string) {
	const ownerUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: ownerUserId });
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: "Acme",
	});
	const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
		orgId,
		scope: "org",
		content,
	});
	return { owner, orgId, id };
}

describe("M3-T02 setEmbeddingInternal", () => {
	it("writes the vector when content still matches what was embedded", async () => {
		const t = newTest();
		const { id } = await setupMemory(t, "fresh");

		const applied = await t.mutation(internal.memory.mutations.setEmbeddingInternal.default, {
			memoryId: id,
			content: "fresh",
			embedding: VECTOR,
		});

		expect(applied).toBe(true);
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
	});

	it("rejects a vector for superseded content, leaving the row unembedded", async () => {
		const t = newTest();
		const { owner, orgId, id } = await setupMemory(t, "v1");

		// The user edits while the "v1" embedding is still in flight.
		await owner.mutation(api.memory.mutations.upsertMemory.default, {
			id,
			orgId,
			scope: "org",
			content: "v2",
		});

		const applied = await t.mutation(internal.memory.mutations.setEmbeddingInternal.default, {
			memoryId: id,
			content: "v1",
			embedding: VECTOR,
		});

		expect(applied).toBe(false);
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row?.content).toBe("v2");
		expect(row?.embedding).toBeUndefined();
	});

	it("returns false when the row was deleted mid-flight", async () => {
		const t = newTest();
		const { owner, id } = await setupMemory(t, "doomed");
		await owner.mutation(api.memory.mutations.deleteMemory.default, { id });

		const applied = await t.mutation(internal.memory.mutations.setEmbeddingInternal.default, {
			memoryId: id,
			content: "doomed",
			embedding: VECTOR,
		});

		expect(applied).toBe(false);
	});

	it("throws when the vector's dimensionality does not match the index", async () => {
		const t = newTest();
		const { id } = await setupMemory(t, "wrong size");

		await expect(
			t.mutation(internal.memory.mutations.setEmbeddingInternal.default, {
				memoryId: id,
				content: "wrong size",
				embedding: [0.1, 0.2, 0.3],
			}),
		).rejects.toThrow(/3 dimensions, expected 1536/);
	});

	it("does not leak across memories — a vector lands only on its own row", async () => {
		const t = newTest();
		const { owner, orgId, id } = await setupMemory(t, "first");
		const other: Id<"memory"> = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "second",
		});

		await t.mutation(internal.memory.mutations.setEmbeddingInternal.default, {
			memoryId: id,
			content: "first",
			embedding: VECTOR,
		});

		expect((await t.run((ctx) => ctx.db.get(id)))?.embedding).toHaveLength(EMBEDDING_DIMENSIONS);
		expect((await t.run((ctx) => ctx.db.get(other)))?.embedding).toBeUndefined();
	});
});
