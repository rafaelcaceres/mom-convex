import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { getAgent } from "../../agents/_libs/agentFactory";
import { buildProviderOptions } from "../../agents/_libs/providerOptions";
import { buildSystemPrompt } from "../../agents/_libs/systemPrompt";
import { saveUserMessage, streamAssistantReply } from "../../agents/adapters/threadBridge";
import { priceFromUsage } from "../../cost/_libs/priceFromUsage";
import { internalAction } from "../../customFunctions";
import { buildToolSet } from "../../skills/_libs/resolveTools";
import { formatReasoningReply } from "../../slack/_libs/formatReasoningReply";
import { formatToolReply } from "../../slack/_libs/formatToolReply";
import { markdownToRichText } from "../../slack/_libs/markdownToRichText";
import {
	type SlackPainter,
	buildReasoningSnippet,
	createSlackPainter,
} from "../../slack/_libs/slackPainter";
import { loadBotToken, postSlackMessage } from "../../slack/_libs/slackPoster";

/**
 * Runs one turn of the agent against a user message. Loads the thread +
 * agent config, fetches alwaysOn memories and the resolved skill set, builds
 * the dynamic system prompt (M2-T09), and drives a real `agent.streamText`
 * turn with tools wired via `buildToolSet`.
 *
 * Slack bindings (F-04): the bot's main reply is painted live by the
 * `SlackPainter`. Text deltas grow the message in place via `chat.update`
 * (with a 700ms throttle), tool calls announce themselves inline as
 * `_→ <tool>_` markers that flip to `_✓ <tool>_` / `_✗ <tool>_` on step
 * boundaries. Detailed args/output of each tool call and the full
 * reasoning text continue to land as thread replies under the main
 * message — the inline markers keep the canal readable while the thread
 * preserves the audit trail. The painter persists the captured `ts` to
 * `thread.binding.parentTs` on the first write (crash-recovery anchor).
 * Web bindings don't paint — the UI reads messages reactively from the
 * agent component via `useThreadMessages`.
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
			platform: thread.binding.type,
		});

		// Slack outbound state for the turn. Stays null for non-slack bindings
		// so the painter / chunk handlers skip the Slack branch entirely.
		// `binding.parentTs` from a prior turn is observable (audit/telemetry)
		// but never silently reused as the current anchor — editing an old
		// turn's message would surprise users.
		const slackOutbound =
			thread.binding.type === "slack"
				? {
						installId: thread.binding.installId as Id<"slackInstalls">,
						channelId: thread.binding.channelId,
						threadTs: thread.binding.threadTs,
						botToken: await loadBotToken(ctx, thread.binding.installId as Id<"slackInstalls">),
					}
				: null;

		const painter: SlackPainter | null = slackOutbound
			? createSlackPainter({
					botToken: slackOutbound.botToken,
					channelId: slackOutbound.channelId,
					threadTs: slackOutbound.threadTs,
					persistMainTs: async (ts) => {
						await ctx.runMutation(internal.threads.mutations.setThreadParentTs.default, {
							threadId: args.threadId,
							ts,
						});
					},
				})
			: null;

		// Capture the anchor BEFORE the stream starts so subsequent thread
		// replies fired from `onStepFinish` always have a valid parent ts.
		// Without this, the first chat.postMessage races against the first
		// step's reasoning/tool replies — for top-level mentions (no
		// `threadTs` fallback) those replies leak into the channel as
		// loose messages.
		if (painter) await painter.start();

		// Reasoning is streamed as `reasoning-delta` chunks BEFORE the first
		// text-delta / tool-call of a step (Anthropic extended thinking,
		// Gemini `thinkingConfig.includeThoughts`). We buffer here and paint
		// the snippet on the first non-reasoning chunk of the step, so the
		// "_thinking…_" line appears inline while the model is still
		// reasoning, and stays visible during text streaming. Reset per step
		// (a step boundary clears the buffer in `onStepFinish`).
		let reasoningBuffer = "";
		let reasoningPaintedThisStep = false;
		const flushReasoningSnippet = () => {
			if (!painter) return;
			if (reasoningPaintedThisStep) return;
			if (reasoningBuffer.length === 0) return;
			painter.markReasoning(buildReasoningSnippet(reasoningBuffer));
			reasoningPaintedThisStep = true;
		};

		// Belt-and-suspenders for the painter's final state. The AI SDK can
		// throw mid-stream (provider validation, rate limit, transient
		// network) and without this wrapper the `flushFinal` below never
		// runs — the user is left staring at the last live render, which
		// may have an unclosed `**` from a partially-streamed bold pair
		// that markdownToMrkdwn (correctly) didn't convert.
		let replyText = "";
		let streamErr: unknown = null;
		// Tracks per-tool-call start times so the thread-reply card can
		// surface a `(0.5s)` duration next to the tool name. The Map lives
		// for the whole turn — short-lived, dropped when the action returns.
		const toolStartedAt = new Map<string, number>();
		try {
			const result = await streamAssistantReply(ctx, {
				agent,
				agentThreadId: thread.agentThreadId,
				promptMessageId: messageId,
				userId: args.userMessage.senderId,
				tools: Object.keys(tools).length > 0 ? tools : undefined,
				system: systemPrompt,
				providerOptions: buildProviderOptions(agentDoc.modelProvider),
				// Slack turns drive their own live edit via the painter; the
				// agent component's UIMessage delta pipeline isn't read by
				// any consumer here AND has surfaced provider-shape errors
				// (Gemini "function call turn..." stream validation). Web
				// turns keep deltas on for reactive `useThreadMessages`.
				disableStreamDeltas: slackOutbound !== null,
				onChunk: painter
					? ({ chunk }) => {
							if (chunk.type === "reasoning-delta") {
								reasoningBuffer += chunk.text;
							} else if (chunk.type === "text-delta") {
								flushReasoningSnippet();
								painter.appendText(chunk.text);
							} else if (chunk.type === "tool-call") {
								flushReasoningSnippet();
								toolStartedAt.set(chunk.toolCallId, Date.now());
								painter.markToolStart({
									toolCallId: chunk.toolCallId,
									toolName: chunk.toolName,
								});
							}
						}
					: undefined,
				onStepFinish: async (step) => {
					// Per-step ledger append (M2-T15). One row for the LLM step plus
					// one per tool call in that step — the tool rows carry no tokens
					// (the LLM step already accounts for them) but give the dashboard
					// a handle on tool usage frequency + per-tool detail on
					// /threads/[id] (M2-T18).
					const createdAt = Date.now();
					const price = priceFromUsage({ model: agentDoc.modelId, usage: step.usage });
					const base = {
						orgId: agentDoc.orgId,
						agentId: agentDoc._id,
						threadId: args.threadId,
						provider: agentDoc.modelProvider,
						model: agentDoc.modelId,
						createdAt,
					};
					await ctx.runMutation(internal.cost.mutations.record.default, {
						...base,
						tokensIn: price.tokensIn,
						tokensOut: price.tokensOut,
						cacheRead: price.cacheRead,
						cacheWrite: price.cacheWrite,
						costUsd: price.costUsd,
						stepType: "text-generation",
					});
					if (step.toolCalls.length > 0) {
						await Promise.all(
							step.toolCalls.map((call) =>
								ctx.runMutation(internal.cost.mutations.record.default, {
									...base,
									tokensIn: 0,
									tokensOut: 0,
									cacheRead: 0,
									cacheWrite: 0,
									costUsd: 0,
									stepType: "tool-call",
									toolName: call.toolName,
								}),
							),
						);
					}

					if (slackOutbound && painter) {
						const reasoningText = step.reasoningText?.trim() ?? "";
						const hasReasoning = reasoningText.length > 0;
						const hasToolCalls = step.toolCalls.length > 0;

						// Reset per-step reasoning state regardless of branch — the
						// next step's reasoning-deltas need a fresh buffer.
						const buffered = reasoningBuffer;
						reasoningBuffer = "";
						const wasPaintedFromStream = reasoningPaintedThisStep;
						reasoningPaintedThisStep = false;

						if (!hasReasoning && !hasToolCalls) return;

						// Flip running tool markers to ✓/✗ first so the painter
						// reflects the step outcome before we post detail replies.
						for (const call of step.toolCalls) {
							const errored = "error" in call && call.error !== undefined && call.error !== null;
							painter.markToolEnd({ toolCallId: call.toolCallId, ok: !errored });
						}
						// Fallback: if the stream didn't expose reasoning-delta but
						// the step still has reasoningText (provider variance), paint
						// the snippet here so the user still sees a "thinking" cue.
						if (hasReasoning && !wasPaintedFromStream && buffered.length === 0) {
							painter.markReasoning(buildReasoningSnippet(reasoningText));
						}

						// Thread replies (full detail) — anchored under the main
						// message captured eagerly in `painter.start()`.
						// Posting reasoning before tool calls keeps the thread
						// chronological: thought → action → result.
						const replyAnchor = painter.getMainTs() ?? slackOutbound.threadTs;
						if (hasReasoning) {
							const md = formatReasoningReply(reasoningText);
							const block = markdownToRichText(md);
							await postSlackMessage({
								botToken: slackOutbound.botToken,
								channel: slackOutbound.channelId,
								threadTs: replyAnchor,
								text: md,
								blocks: block ? [block] : undefined,
							});
						}
						for (const call of step.toolCalls) {
							const result = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
							const startedAt = toolStartedAt.get(call.toolCallId);
							const durationMs = startedAt !== undefined ? Date.now() - startedAt : undefined;
							toolStartedAt.delete(call.toolCallId);
							const reply = formatToolReply({
								toolName: call.toolName,
								input: call.input,
								output: result?.output,
								hasOutput: result !== undefined,
								error: "error" in call ? call.error : undefined,
								durationMs,
							});
							const block = markdownToRichText(reply);
							await postSlackMessage({
								botToken: slackOutbound.botToken,
								channel: slackOutbound.channelId,
								threadTs: replyAnchor,
								text: reply,
								blocks: block ? [block] : undefined,
							});
						}
					}
				},
			});
			replyText = result.text;
		} catch (err) {
			streamErr = err;
			console.error("[handleIncoming] streamAssistantReply failed", err);
		}

		if (painter) {
			if (streamErr) {
				await painter.flushFinal("_(erro ao gerar resposta — tente novamente)_");
			} else if (replyText.length === 0) {
				await painter.flushFinal("_(resposta vazia)_");
			} else {
				const block = markdownToRichText(replyText);
				if (block) {
					await painter.flushFinalBlocks({
						blocks: [block],
						// `text` is sent alongside `blocks` only as the notification /
						// accessibility fallback. Keep it short — Slack uses it for
						// push notifications and screen readers, not for the rendered
						// message body.
						fallbackText: replyText.slice(0, 200),
					});
				} else {
					await painter.flushFinal(replyText);
				}
			}
		}

		// Re-throw so the scheduler's retry/backoff still kicks in and
		// `messages:finalizeMessage` reflects the failure. The painter
		// has already overwritten the partial live state above, so the
		// user sees the fallback message regardless of what happens next.
		if (streamErr) throw streamErr;

		return null;
	},
});

export default handleIncoming;
