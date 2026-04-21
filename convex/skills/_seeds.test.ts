import { describe, expect, it } from "vitest";
import { newTest } from "../../test/_helpers/convex";
import { BUILT_IN_SKILLS, seedSkillCatalog } from "./_seeds";
import { SkillCatalogRepository } from "./adapters/skillCatalog.repository";

describe("M2-T02 seedSkillCatalog", () => {
	it("populates catalog with every built-in skill", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await seedSkillCatalog(ctx);
		});

		const keys = await t.run(async (ctx) => {
			const aggs = await SkillCatalogRepository.list(ctx);
			return aggs.map((a) => a.getModel().key).sort();
		});
		const expected = BUILT_IN_SKILLS.filter((s) => s.enabled)
			.map((s) => s.key)
			.sort();
		expect(keys).toEqual(expected);
	});

	it("is idempotent — second run does not duplicate rows", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await seedSkillCatalog(ctx);
			await seedSkillCatalog(ctx);
		});

		const counts = await t.run(async (ctx) => {
			const tally: Record<string, number> = {};
			for (const skill of BUILT_IN_SKILLS) {
				const agg = await SkillCatalogRepository.getByKey(ctx, { key: skill.key });
				tally[skill.key] = agg ? 1 : 0;
			}
			return tally;
		});

		for (const skill of BUILT_IN_SKILLS) {
			expect(counts[skill.key]).toBe(1);
		}
	});

	it("persists a valid serialized JSON schema for each built-in", () => {
		for (const skill of BUILT_IN_SKILLS) {
			expect(() => JSON.parse(skill.zodSchemaJson)).not.toThrow();
		}
	});
});
