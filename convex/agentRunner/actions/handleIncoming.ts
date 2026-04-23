import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { getAgent } from "../../agents/_libs/agentFactory";
import { buildSystemPrompt } from "../../agents/_libs/systemPrompt";
import { saveUserMessage, streamAssistantReply } from "../../agents/adapters/threadBridge";
import { internalAction } from "../../customFunctions";
import { buildToolSet } from "../../skills/_libs/resolveTools";

/**
 * Runs one turn of the agent against a user message. Loads the thread +
 * agent config, fetches alwaysOn memories and the resolved skill set, builds
 * the dynamic system prompt (M2-T09), and drives a real `agent.streamText`
 * turn with tools wired via `buildToolSet`. Slack bindings get the final
 * text scheduled out via `internal.slack.actions.postMessage`.
 *
 * Web bindings don't need a scheduled dispatch — the UI reads messages
 * reactively from the agent component via `useThreadMessages`.
 */
const handleIncoming = internalAction({
	args: {
		orgId: v.string(),
		threadId: v.id("threads"),
		userMessage: v.object({
			text: v.string(),
			senderId: v.optional(v.string()),
		}),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userText = args.userMessage.text.trim();
		if (!userText) return null;

		const thread = await ctx.runQuery(internal.threads.queries.getById.default, {
			threadId: args.threadId,
		});
		if (!thread) return null;

		const agentDoc = await ctx.runQuery(internal.agents.queries.getByIdInternal.default, {
			agentId: thread.agentId,
		});
		if (!agentDoc) return null;

		const { messageId } = await saveUserMessage(ctx, {
			agentThreadId: thread.agentThreadId,
			text: userText,
			userId: args.userMessage.senderId,
		});

		const agent = getAgent({
			orgId: agentDoc.orgId,
			agentId: agentDoc._id,
			modelId: agentDoc.modelId,
			modelProvider: agentDoc.modelProvider,
			name: agentDoc.name,
			systemPrompt: agentDoc.systemPrompt,
			toolsAllowlist: agentDoc.toolsAllowlist,
		});

		const [skillEntries, memories] = await Promise.all([
			ctx.runQuery(internal.skills.queries.listResolvedForAgentInternal.default, {
				agentId: agentDoc._id,
			}),
			ctx.runQuery(internal.memory.queries.listAlwaysOnInternal.default, {
				orgId: agentDoc.orgId,
				agentId: agentDoc._id,
				threadId: args.threadId,
			}),
		]);

		const tools = buildToolSet({
			entries: skillEntries,
			runAction: ctx.runAction.bind(ctx),
			scope: {
				orgId: agentDoc.orgId,
				agentId: agentDoc._id,
				threadId: args.threadId,
				agentThreadId: thread.agentThreadId,
				userId: args.userMessage.senderId ?? null,
			},
		});

		const systemPrompt = buildSystemPrompt({
			agent: { name: agentDoc.name, systemPrompt: agentDoc.systemPrompt },
			memories,
			users: [],
			channels: [],
			skills: skillEntries.map((e) => ({
				skillKey: e.skillKey,
				name: e.name,
				description: e.description,
			})),
		});

		const { text: replyText } = await streamAssistantReply(ctx, {
			agent,
			agentThreadId: thread.agentThreadId,
			promptMessageId: messageId,
			userId: args.userMessage.senderId,
			tools: Object.keys(tools).length > 0 ? tools : undefined,
			system: systemPrompt,
		});

		if (thread.binding.type === "slack") {
			await ctx.scheduler.runAfter(0, internal.slack.actions.postMessage.default, {
				installId: thread.binding.installId as Id<"slackInstalls">,
				channelId: thread.binding.channelId,
				threadTs: thread.binding.threadTs,
				text: replyText,
			});
		}

		return null;
	},
});

export default handleIncoming;
