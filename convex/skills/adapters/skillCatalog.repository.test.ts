import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { NewSkillCatalog } from "../domain/skill.model";
import { SkillCatalogRepository } from "./skillCatalog.repository";

const baseSkill: NewSkillCatalog = {
	key: "http.fetch",
	name: "HTTP Fetch",
	description: "Fetch an HTTP resource",
	zodSchemaJson: '{"type":"object"}',
	sideEffect: "read",
	enabled: true,
};

describe("M2-T02 SkillCatalogRepository", () => {
	it("getByKey returns the aggregate for a registered skill", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await SkillCatalogRepository.create(ctx, baseSkill);
		});

		const found = await t.run(async (ctx) => {
			const agg = await SkillCatalogRepository.getByKey(ctx, { key: "http.fetch" });
			return agg?.getModel() ?? null;
		});
		expect(found?.key).toBe("http.fetch");
		expect(found?.sideEffect).toBe("read");
	});

	it("getByKey returns null when no skill matches", async () => {
		const t = newTest();
		const miss = await t.run(async (ctx) => {
			const agg = await SkillCatalogRepository.getByKey(ctx, { key: "does.not.exist" });
			return agg?.getModel() ?? null;
		});
		expect(miss).toBeNull();
	});

	it("list returns only enabled skills", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await SkillCatalogRepository.create(ctx, { ...baseSkill, key: "a.one", enabled: true });
			await SkillCatalogRepository.create(ctx, { ...baseSkill, key: "a.two", enabled: true });
			await SkillCatalogRepository.create(ctx, { ...baseSkill, key: "z.off", enabled: false });
		});

		const keys = await t.run(async (ctx) => {
			const aggs = await SkillCatalogRepository.list(ctx);
			return aggs.map((s) => s.getModel().key).sort();
		});
		expect(keys).toEqual(["a.one", "a.two"]);
	});
});
