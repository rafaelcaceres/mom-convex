import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { seedSkillCatalog } from "../_seeds";

/**
 * Populate the `skillCatalog` table with built-in skills. Idempotent — safe
 * to run after pulling new skill definitions. Trigger with
 * `npx convex run skills/mutations/seedCatalog` (Convex CLI uses `/` for
 * module paths, not `:`). A future UI task will wrap this.
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
