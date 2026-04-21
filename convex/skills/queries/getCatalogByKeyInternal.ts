import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { SkillCatalogRepository } from "../adapters/skillCatalog.repository";

/**
 * Internal catalog lookup by key, used by `skills.invoke` to resolve the
 * declared `sideEffect` before dispatching. Returns the raw catalog model
 * (or `null`) — callers don't need the aggregate.
 */
const getCatalogByKeyInternal = internalQuery({
	args: { key: v.string() },
	returns: v.union(
		v.object({
			_id: v.id("skillCatalog"),
			_creationTime: v.number(),
			key: v.string(),
			name: v.string(),
			description: v.string(),
			zodSchemaJson: v.string(),
			requiredCredType: v.optional(v.string()),
			sideEffect: v.union(v.literal("read"), v.literal("write")),
			enabled: v.boolean(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const agg = await SkillCatalogRepository.getByKey(ctx, { key: args.key });
		return agg?.getModel() ?? null;
	},
});

export default getCatalogByKeyInternal;
