import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { listThreadMessages } from "../../agents/adapters/threadBridge";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";

/**
 * Reactive feed of a web thread's messages for the UI. Ownership is derived
 * server-side from the thread's web binding, never from a client-supplied
 * userId — otherwise any authenticated user could spy on another's thread.
 *
 * Messages are read from the `@convex-dev/agent` component via the bridge;
 * we project to a small view-model shape the chat UI consumes
 * (`{role, text, createdAt}`).
 */

const ChatMessageView = v.object({
	messageId: v.string(),
	role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
	text: v.string(),
	createdAt: v.number(),
});

const listMessages = query({
	args: { threadId: v.id("threads") },
	returns: v.array(ChatMessageView),
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

		const page = await listThreadMessages(ctx, {
			agentThreadId: model.agentThreadId,
			paginationOpts: { cursor: null, numItems: 200 },
			excludeToolMessages: true,
		});

		return page.page
			.filter((doc) => {
				const role = doc.message?.role;
				return role === "user" || role === "assistant" || role === "system";
			})
			.map((doc) => ({
				messageId: doc._id,
				role: doc.message?.role as "user" | "assistant" | "system",
				text: doc.text ?? "",
				createdAt: doc._creationTime,
			}))
			.sort((a, b) => a.createdAt - b.createdAt);
	},
});

export default listMessages;
