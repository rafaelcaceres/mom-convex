import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { internal } from "../../_generated/api";
import { BUILT_IN_SKILLS, seedSkillCatalog } from "../_seeds";

/**
 * F-01 — the catalog drifting away from the code, silently.
 *
 * The failure it was filed for, and which actually happened while shipping
 * `event.create`'s `timezone` argument: change a skill's zod schema, deploy,
 * and the catalog still serves the OLD JSON schema to the model. The tool
 * advertises arguments it no longer takes — or hides the one that fixes the bug
 * you just shipped — and nothing errors anywhere. `seedCatalog` can't help: it
 * only inserts what's missing.
 */

const eventCreate = BUILT_IN_SKILLS.find((s) => s.key === "event.create");
if (!eventCreate) throw new Error("fixture assumes event.create is a built-in");

describe("F-01 resyncCatalog", () => {
	it("updates a row whose schema drifted away from the code", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await seedSkillCatalog(ctx);
		});

		// Simulate the drift: a catalog row from before `timezone` existed.
		const stale = await t.run(async (ctx) => {
			const row = await ctx.db
				.query("skillCatalog")
				.filter((q) => q.eq(q.field("key"), "event.create"))
				.unique();
			if (!row) throw new Error("seed missing");
			await ctx.db.patch(row._id, {
				zodSchemaJson: '{"type":"object","properties":{"text":{"type":"string"}}}',
				description: "old description without timezone",
			});
			return row._id;
		});

		const result = await t.mutation(internal.skills.mutations.resyncCatalog.default, {});

		expect(result.updated).toContain("event.create");
		expect(result.inserted).toEqual([]);

		const row = await t.run((ctx) => ctx.db.get(stale));
		expect(row?.zodSchemaJson).toBe(eventCreate.zodSchemaJson);
		expect(row?.description).toBe(eventCreate.description);
		// The whole point: the model can now see the argument that exists.
		expect(row?.zodSchemaJson).toContain("timezone");
	});

	it("never re-enables a skill an admin turned off", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await seedSkillCatalog(ctx);
		});

		const id = await t.run(async (ctx) => {
			const row = await ctx.db
				.query("skillCatalog")
				.filter((q) => q.eq(q.field("key"), "sandbox.bash"))
				.unique();
			if (!row) throw new Error("seed missing");
			// An admin disabled it, AND the description drifted — so the row is
			// genuinely stale and WILL be touched. `enabled` must survive anyway:
			// a resync that silently re-armed a disabled skill would be a security
			// regression wearing a bugfix's clothes.
			await ctx.db.patch(row._id, { enabled: false, description: "stale" });
			return row._id;
		});

		const result = await t.mutation(internal.skills.mutations.resyncCatalog.default, {});
		expect(result.updated).toContain("sandbox.bash");

		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row?.enabled).toBe(false);
		expect(row?.description).not.toBe("stale"); // everything else did adopt
	});

	it("inserts what is missing, and is a no-op when everything is current", async () => {
		const t = newTest();

		const first = await t.mutation(internal.skills.mutations.resyncCatalog.default, {});
		expect(first.inserted).toHaveLength(BUILT_IN_SKILLS.length);
		expect(first.updated).toEqual([]);

		const second = await t.mutation(internal.skills.mutations.resyncCatalog.default, {});
		expect(second.inserted).toEqual([]);
		expect(second.updated).toEqual([]);
		expect(second.unchanged).toHaveLength(BUILT_IN_SKILLS.length);
	});
});
