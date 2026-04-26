import type { Agent } from "@convex-dev/agent";
import { createThread, listMessages, saveMessage } from "@convex-dev/agent";
import {
	type StepResult,
	type StopCondition,
	type StreamTextOnChunkCallback,
	type ToolSet,
	stepCountIs,
} from "ai";
import type { PaginationOptions } from "convex/server";
import { components } from "../../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";
import type { ProviderOptions } from "../_libs/providerOptions";

/**
 * Thin wrapper around `@convex-dev/agent` free functions. Keeps the
 * component reference in one place so domain code never has to reach into
 * `components.agent` directly. Names mirror the intent of each call so
 * callers read at the domain level (e.g. `saveUserMessage`, not
 * `saveMessage with role="user"`).
 */

export async function createAgentThread(
	ctx: MutationCtx | ActionCtx,
	args?: { userId?: string | null; title?: string; summary?: string },
): Promise<string> {
	return await createThread(ctx, components.agent, args);
}

/**
 * Kick off an async cascade delete of a thread inside the agent component
 * (messages, streams, the thread row itself). The component mutation is
 * self-rescheduling — one call is enough. Scheduling via `runAfter(0, ...)`
 * keeps the current transaction small. Idempotent: if the thread is already
 * gone the component call is a no-op.
 */
export async function scheduleDeleteAgentThread(
	ctx: MutationCtx | ActionCtx,
	args: { agentThreadId: string },
): Promise<void> {
	await ctx.scheduler.runAfter(0, components.agent.threads.deleteAllForThreadIdAsync, {
		threadId: args.agentThreadId,
	});
}

export async function saveUserMessage(
	ctx: MutationCtx | ActionCtx,
	args: {
		agentThreadId: string;
		text: string;
		userId?: string | null;
		agentName?: string;
	},
): Promise<{ messageId: string }> {
	const { messageId } = await saveMessage(ctx, components.agent, {
		threadId: args.agentThreadId,
		userId: args.userId,
		prompt: args.text,
		agentName: args.agentName,
	});
	return { messageId };
}

export async function saveAssistantMessage(
	ctx: MutationCtx | ActionCtx,
	args: { agentThreadId: string; text: string; agentName?: string },
): Promise<{ messageId: string }> {
	const { messageId } = await saveMessage(ctx, components.agent, {
		threadId: args.agentThreadId,
		message: { role: "assistant", content: args.text },
		agentName: args.agentName,
	});
	return { messageId };
}

const DEFAULT_PAGE: PaginationOptions = { cursor: null, numItems: 100 };

/**
 * Drives a single assistant turn via the component's `streamText`. The
 * caller is expected to have already persisted the user message and to
 * pass its `promptMessageId` as the anchor — this avoids double-saving
 * the input while still letting the component handle the output message.
 *
 * Returns the final text. We await `result.text` rather than streaming
 * over HTTP because M2-T01 is server-side only; the browser reads the
 * persisted assistant message reactively via `useThreadMessages`.
 * Live-edit UX for Slack / SSE is tracked as a follow-up (see M2-T01).
 */
/**
 * Default multi-step budget for tool-calling turns. The model loops
 * model→tool→model up to this many times before the orchestrator cuts it off
 * (M2-T04). Eight is a soft ceiling from the AI SDK docs — enough to chain a
 * couple of lookups plus a final answer, low enough to bound cost.
 */
const DEFAULT_STEP_LIMIT = 8;

/**
 * Cap on how many prior messages the component replays into the prompt on
 * every turn. The component's default is 100 — in a tool-heavy thread (e.g.
 * `http.fetch` returning ~12k tokens each) that blew past Claude's 200k
 * context window around 40 messages. 25 keeps the prompt bounded while still
 * giving enough local coherence for multi-turn conversation. When long-term
 * memory matters, add `searchOptions.vectorSearch` on top (Passo 2) rather
 * than bumping this number.
 */
export const DEFAULT_RECENT_MESSAGES = 25;

export async function streamAssistantReply(
	ctx: ActionCtx,
	args: {
		agent: Agent;
		agentThreadId: string;
		promptMessageId: string;
		userId?: string | null;
		tools?: ToolSet;
		stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
		recentMessages?: number;
		system?: string;
		onStepFinish?: (step: StepResult<ToolSet>) => void | Promise<void>;
		/**
		 * Fires per stream chunk (text-delta, tool-call, tool-result, etc.).
		 * Forwarded straight to AI SDK's `streamText`. Used by the Slack
		 * adapter (F-04) to drive the live-edit painter — text deltas grow
		 * the main message, tool-call chunks announce running tools inline.
		 */
		onChunk?: StreamTextOnChunkCallback<ToolSet>;
		/**
		 * Per-turn provider knobs forwarded to the AI SDK. Used to enable
		 * Gemini's `thinkingConfig.includeThoughts` so `step.reasoningText`
		 * is populated for the F-03 reasoning-on-thread-reply path.
		 */
		providerOptions?: ProviderOptions;
		/**
		 * Skip the agent component's `saveStreamDeltas` pipeline (which
		 * persists UI-message deltas for reactive web clients). Slack
		 * turns drive their own live edit via the painter and don't need
		 * the deltas table — and the AI SDK's UIMessage stream validator
		 * has historically thrown on certain provider stream shapes
		 * (Gemini "function call turn..." errors), failing the entire
		 * turn. Defaults to enabled (web parity).
		 */
		disableStreamDeltas?: boolean;
	},
): Promise<{ text: string }> {
	const tools = args.tools ?? undefined;
	const stopWhen = args.stopWhen ?? (tools ? stepCountIs(DEFAULT_STEP_LIMIT) : undefined);
	const recentMessages = args.recentMessages ?? DEFAULT_RECENT_MESSAGES;

	const result = await args.agent.streamText(
		ctx,
		{ threadId: args.agentThreadId, userId: args.userId ?? undefined },
		{
			promptMessageId: args.promptMessageId,
			tools,
			stopWhen,
			system: args.system,
			onStepFinish: args.onStepFinish,
			onChunk: args.onChunk,
			// AI SDK's `ProviderOptions` is `Record<string, JSONObject>`; our
			// structural alias drops the JSONValue narrowing because importing
			// from `@ai-sdk/provider-utils` would couple every caller to a
			// transitive package. Cast at the boundary — the runtime contract
			// is identical (provider-keyed config bag).
			// biome-ignore lint/suspicious/noExplicitAny: AI SDK boundary cast
			providerOptions: args.providerOptions as any,
		},
		// `saveStreamDeltas` writes incremental text deltas to the agent
		// component's stream table so reactive web clients can render the
		// assistant message growing token-by-token via
		// `useStreamingUIMessages`. Slack still consumes the final
		// `result.text` (chat.update with the full reply); the deltas
		// are a no-op for that path.
		//
		// Tuning: default chunking groups by punctuation+whitespace and the
		// throttle is 250ms — a fast Anthropic/Gemini reply often finishes
		// inside one throttle window, landing as a single delta and
		// rendering "all-at-once" in the UI. Word-level chunking + a 60ms
		// throttle gets one delta every ~5 words, which paired with
		// `useSmoothText` reads as smooth typing.
		//
		// Disabled under vitest: the DeltaStreamer's throttle doesn't
		// advance under `vi.useFakeTimers({ toFake: ["setTimeout"] })`
		// used by the M1 smoke + handleIncoming suites, which would
		// otherwise hang `result.text`. Production paths always run with
		// `process.env.VITEST` unset.
		{
			saveStreamDeltas:
				args.disableStreamDeltas || process.env.VITEST
					? false
					: { chunking: "word", throttleMs: 60 },
			contextOptions: { recentMessages },
		},
	);
	const text = await result.text;
	return { text };
}

export async function listThreadMessages(
	ctx: QueryCtx | MutationCtx | ActionCtx,
	args: {
		agentThreadId: string;
		paginationOpts?: PaginationOptions;
		excludeToolMessages?: boolean;
	},
) {
	return await listMessages(ctx, components.agent, {
		threadId: args.agentThreadId,
		paginationOpts: args.paginationOpts ?? DEFAULT_PAGE,
		excludeToolMessages: args.excludeToolMessages,
	});
}
