import { createRepository } from "../../_shared/_libs/repository";
import { SkillCatalogAgg } from "../domain/skill.model";
import type { ISkillCatalogRepository } from "../domain/skill.repository";

const MAX_CATALOG_SIZE = 200;

export const SkillCatalogRepository: ISkillCatalogRepository = {
	...createRepository("skillCatalog", (doc) => new SkillCatalogAgg(doc)),

	getByKey: async (ctx, { key }) => {
		const doc = await ctx.db
			.query("skillCatalog")
			.withIndex("by_key", (q) => q.eq("key", key))
			.unique();
		if (!doc) return null;
		return new SkillCatalogAgg(doc);
	},

	list: async (ctx) => {
		const docs = await ctx.db
			.query("skillCatalog")
			.withIndex("by_enabled", (q) => q.eq("enabled", true))
			.take(MAX_CATALOG_SIZE);
		return docs.map((doc) => new SkillCatalogAgg(doc));
	},
};
