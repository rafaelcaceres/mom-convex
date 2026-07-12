import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { SkillCatalogRepository } from "../adapters/skillCatalog.repository";
import { SkillCatalogModel } from "../domain/skill.model";

/**
 * Internal catalog lookup by key, used by `skills.invoke` to resolve the
 * confirmation policy before dispatching. Returns the raw catalog model (or
 * `null`) — callers don't need the aggregate.
 *
 * The return validator reuses `SkillCatalogModel` rather than re-declaring the
 * shape inline. It used to be a hand-rolled copy, which silently drifted the
 * moment a field was added to the domain model: the row carried the new field,
 * the validator rejected it, and every tool call in the app failed at once.
 */
const getCatalogByKeyInternal = internalQuery({
	args: { key: v.string() },
	returns: v.union(SkillCatalogModel, v.null()),
	handler: async (ctx, args) => {
		const agg = await SkillCatalogRepository.getByKey(ctx, { key: args.key });
		return agg?.getModel() ?? null;
	},
});

export default getCatalogByKeyInternal;
