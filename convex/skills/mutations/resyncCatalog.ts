import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { resyncSkillCatalog } from "../_seeds";

/**
 * Reconcile `skillCatalog` with the built-ins in code (F-01). Run after any
 * deploy that changes a skill's zod schema, description, or policy:
 *
 *   npx convex run skills/mutations/resyncCatalog --prod
 *
 * `seedCatalog` only inserts what is missing, so without this a changed schema
 * never reaches the model: the tool keeps advertising its old arguments and
 * nothing errors. Preserves `enabled` — an admin's off switch stays off.
 */
const resyncCatalog = internalMutation({
	args: {},
	returns: v.object({
		inserted: v.array(v.string()),
		updated: v.array(v.string()),
		unchanged: v.array(v.string()),
	}),
	handler: async (ctx) => resyncSkillCatalog(ctx),
});

export default resyncCatalog;
