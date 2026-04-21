import type { QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { SkillCatalog, SkillCatalogAgg } from "./skill.model";

export interface ISkillCatalogRepository extends IRepository<"skillCatalog", SkillCatalogAgg> {
	getByKey(ctx: QueryCtx, clause: { key: SkillCatalog["key"] }): Promise<SkillCatalogAgg | null>;

	/**
	 * Returns only skills with `enabled: true`. Disabled rows stay in the
	 * catalog for historical reference (past agent bindings still resolve
	 * their `_id`) but are hidden from tool resolution and dashboard lists.
	 */
	list(ctx: QueryCtx): Promise<SkillCatalogAgg[]>;
}
