import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { Doc } from "../../_generated/dataModel";
import type { IAggregate } from "./aggregate";
import { createRepository } from "./repository";

class FixtureAgg implements IAggregate<Doc<"testFixtures">> {
	constructor(private readonly doc: Doc<"testFixtures">) {}
	getModel() {
		return this.doc;
	}
	rename(newName: string): Doc<"testFixtures"> {
		this.doc.name = newName;
		return this.doc;
	}
}

const FixtureRepo = createRepository("testFixtures", (doc) => new FixtureAgg(doc));

describe("M0-T04 createRepository factory", () => {
	it("returns { get, save, create, delete } shape", () => {
		expect(typeof FixtureRepo.get).toBe("function");
		expect(typeof FixtureRepo.save).toBe("function");
		expect(typeof FixtureRepo.create).toBe("function");
		expect(typeof FixtureRepo.delete).toBe("function");
	});

	it("create inserts and returns aggregate wrapping the doc", async () => {
		const t = newTest();
		const doc = await t.run(async (ctx) => {
			const agg = await FixtureRepo.create(ctx, { name: "alice", value: 1 });
			// Return only the plain model — class instances aren't serializable across t.run.
			return agg.getModel();
		});
		expect(doc.name).toBe("alice");
		expect(doc.value).toBe(1);
		expect(doc._id).toBeDefined();
	});

	it("get by id returns aggregate; unknown id returns null", async () => {
		const t = newTest();
		const id = await t.run(async (ctx) => {
			const agg = await FixtureRepo.create(ctx, { name: "bob" });
			return agg.getModel()._id;
		});

		const found = await t.run(async (ctx) => {
			const agg = await FixtureRepo.get(ctx, id);
			return agg?.getModel() ?? null;
		});
		expect(found?.name).toBe("bob");

		// Unknown id of the same table shape: swap the document counter portion
		const fakeId = id.replace(/^\d+/, "99999") as typeof id;
		const missing = await t.run(async (ctx) => {
			const agg = await FixtureRepo.get(ctx, fakeId);
			return agg?.getModel() ?? null;
		});
		expect(missing).toBeNull();
	});

	it("save persists full replacement (not patch)", async () => {
		const t = newTest();
		const id = await t.run(async (ctx) => {
			const agg = await FixtureRepo.create(ctx, { name: "original", value: 10 });
			return agg.getModel()._id;
		});

		await t.run(async (ctx) => {
			const agg = await FixtureRepo.get(ctx, id);
			if (!agg) throw new Error("expected fixture");
			agg.rename("renamed");
			await FixtureRepo.save(ctx, agg);
		});

		const reloaded = await t.run(async (ctx) => {
			const agg = await FixtureRepo.get(ctx, id);
			return agg?.getModel() ?? null;
		});
		expect(reloaded?.name).toBe("renamed");
		// Value must still be present — save replaces the whole document including
		// fields the caller did not mutate.
		expect(reloaded?.value).toBe(10);
	});

	it("delete removes the document", async () => {
		const t = newTest();
		const id = await t.run(async (ctx) => {
			const agg = await FixtureRepo.create(ctx, { name: "doomed" });
			return agg.getModel()._id;
		});
		await t.run(async (ctx) => {
			await FixtureRepo.delete(ctx, id);
		});
		const gone = await t.run(async (ctx) => {
			const agg = await FixtureRepo.get(ctx, id);
			return agg?.getModel() ?? null;
		});
		expect(gone).toBeNull();
	});
});
