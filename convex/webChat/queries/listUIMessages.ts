import { listUIMessages as agentListUIMessages, syncStreams, vStreamArgs } from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "../../_generated/api";
import { requireIdentity } from "../../auth.utils";
import { query } from "../../customFunctions";
import { ThreadRepository } from "../../threads/adapters/thread.repository";

/**
 * Single source of truth for the web chat UI: returns saved UIMessages
 * (with `parts` already in stream order — text, reasoning, tool calls
 * interleaved as the model emitted them) PLUS in-flight stream deltas.
 *
 * Consumed by `useUIMessages(... { stream: true })` in
 * `app/chat/MessageList.tsx`. The hook merges the paginated result with
 * the streaming entries via `dedupeMessages`, so a streaming message
 * keeps the same React `key` when it transitions to `success` — no
 * unmount/remount, no flicker, the assistant bubble grows in place.
 *
 * Replaces the older split between `listThreadEvents` (saved-only) and
 * `streamingMessages` (streaming-only), which produced a double-render
 * around the streaming→saved boundary and required the UI to compose
 * two unrelated feeds.
 *
 * Auth: ownership derived server-side from the thread's web binding.
 */
const listUIMessages = query({
	args: {
		threadId: v.id("threads"),
		paginationOpts: paginationOptsValidator,
		streamArgs: vStreamArgs,
	},
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

		const paginated = await agentListUIMessages(ctx, components.agent, {
			threadId: model.agentThreadId,
			paginationOpts: args.paginationOpts,
		});
		const streams = await syncStreams(ctx, components.agent, {
			threadId: model.agentThreadId,
			streamArgs: args.streamArgs,
		});
		return { ...paginated, streams };
	},
});

export default listUIMessages;
