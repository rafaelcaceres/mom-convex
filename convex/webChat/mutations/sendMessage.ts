import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { requireIdentity } from "../../auth.utils";
import { mutation } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";

/**
 * User sends a message on a web-bound thread. Guards:
 *   - auth required
 *   - thread must exist
 *   - thread binding must be web & pinned to this user (owner-only for now)
 *
 * The agentRunner is the single writer on the agent component's message
 * log — this mutation just schedules it. Client sees both turns arrive
 * reactively.
 */
const sendMessage = mutation({
	args: {
		threadId: v.id("threads"),
		text: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireIdentity(ctx);
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error("Authentication required");

		const thread = await ThreadRepository.get(ctx, args.threadId);
		if (!thread) throw new Error("Thread not found");
		const model = thread.getModel();
		if (model.binding.type !== "web" || model.binding.userId !== userId) {
			throw new Error("Forbidden");
		}

		const trimmed = args.text.trim();
		if (!trimmed) return null;

		await ctx.scheduler.runAfter(0, internal.agentRunner.actions.handleIncoming.default, {
			orgId: model.orgId,
			threadId: model._id,
			userMessage: { text: trimmed, senderId: userId },
		});

		return null;
	},
});

export default sendMessage;
