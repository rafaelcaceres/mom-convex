import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { seedSkillCatalog } from "../_seeds";

/**
 * Populate the `skillCatalog` table with built-in skills. Idempotent — safe
 * to run after pulling new skill definitions. Trigger from the dashboard
 * with `convex run skills:mutations:seedCatalog:default` (or the UI in a
 * future task).
 */
const seedCatalog = internalMutation({
	args: {},
	returns: v.array(v.string()),
	handler: async (ctx) => {
		const aggs = await seedSkillCatalog(ctx);
		return aggs.map((a) => a.getModel().key);
	},
});

export default seedCatalog;
