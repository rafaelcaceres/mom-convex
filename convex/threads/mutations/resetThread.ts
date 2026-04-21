import { v } from "convex/values";
import { createAgentThread, scheduleDeleteAgentThread } from "../../agents/adapters/threadBridge";
import { internalMutation } from "../../customFunctions";
import { ThreadRepository } from "../adapters/thread.repository";

/**
 * Start a thread over: preserve the binding row (same `threadId`, same
 * Slack/web routing) but swap the underlying `agentThreadId` for a fresh
 * one, and queue the old component-side thread for async deletion.
 *
 * Context window escape hatch — when a Slack or web conversation blows past
 * the model's token limit (M2-T01's `@convex-dev/agent` replays full history
 * on every turn with no cap yet), the operator can call this to recover
 * without re-creating users, re-wiring bindings, or breaking URLs that
 * reference the wrapper `threadId`.
 */
const resetThread = internalMutation({
	args: { threadId: v.id("threads") },
	returns: v.object({
		threadId: v.id("threads"),
		agentThreadId: v.string(),
		previousAgentThreadId: v.string(),
	}),
	handler: async (ctx, args) => {
		const agg = await ThreadRepository.get(ctx, args.threadId);
		if (!agg) throw new Error(`Thread '${args.threadId}' not found`);

		const model = agg.getModel();
		const previousAgentThreadId = model.agentThreadId;
		const userId = model.binding.type === "web" ? model.binding.userId : undefined;

		const agentThreadId = await createAgentThread(ctx, { userId });
		agg.setAgentThreadId(agentThreadId);
		await ThreadRepository.save(ctx, agg);

		await scheduleDeleteAgentThread(ctx, { agentThreadId: previousAgentThreadId });

		return {
			threadId: args.threadId,
			agentThreadId,
			previousAgentThreadId,
		};
	},
});

export default resetThread;
