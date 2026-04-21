import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";
import { ThreadModel } from "../../threads/domain/thread.model";

/**
 * Lists the caller's web-bound threads in the given org, newest first.
 *
 * M1 storage is simple — filter all org threads in memory. When volumes
 * grow we add a denormalized `lastMessageAt` column + `by_user_activity`
 * index, but for echo-loop validation this is plenty.
 */
const myThreads = query({
	args: { orgId: v.string() },
	returns: v.array(ThreadModel),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Authentication required");

		const all = await ThreadRepository.listByOrg(ctx, { orgId: args.orgId });
		return all
			.map((agg) => agg.getModel())
			.filter((t) => t.binding.type === "web" && t.binding.userId === userId)
			.sort((a, b) => b._creationTime - a._creationTime);
	},
});

export default myThreads;
