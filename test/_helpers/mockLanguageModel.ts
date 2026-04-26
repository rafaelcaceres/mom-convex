import type {
	LanguageModelV3FinishReason,
	LanguageModelV3StreamPart,
	LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";

/**
 * Test-only faux providers that conform to AI SDK v6 (`LanguageModelV3`).
 * Paired with `_setLanguageModelOverride` from `agents/_libs/agentFactory`
 * so `agent.streamText` runs without hitting a real provider in CI.
 */

const FAKE_USAGE: LanguageModelV3Usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const STOP: LanguageModelV3FinishReason = { unified: "stop", raw: "stop" };

function finishChunk(): LanguageModelV3StreamPart {
	return { type: "finish", finishReason: STOP, usage: FAKE_USAGE };
}

/** Streams the supplied text as a single chunk. */
export function mockTextModel(text: string): MockLanguageModelV3 {
	return new MockLanguageModelV3({
		doStream: async () => ({
			stream: simulateReadableStream<LanguageModelV3StreamPart>({
				chunks: [
					{ type: "stream-start", warnings: [] },
					{ type: "text-start", id: "t0" },
					{ type: "text-delta", id: "t0", delta: text },
					{ type: "text-end", id: "t0" },
					finishChunk(),
				],
			}),
		}),
	});
}

/**
 * Echoes the last user message back prefixed with `echo: ` — keeps M1-era
 * regression tests green after the real `streamText` swap in M2-T01 without
 * re-introducing the echo stub in production code.
 */
export function mockEchoModel(): MockLanguageModelV3 {
	return new MockLanguageModelV3({
		doStream: async ({ prompt }) => {
			const lastUser = [...prompt].reverse().find((m) => m.role === "user");
			const text = extractText(lastUser?.content);
			return {
				stream: simulateReadableStream<LanguageModelV3StreamPart>({
					chunks: [
						{ type: "stream-start", warnings: [] },
						{ type: "text-start", id: "t0" },
						{ type: "text-delta", id: "t0", delta: `echo: ${text}` },
						{ type: "text-end", id: "t0" },
						finishChunk(),
					],
				}),
			};
		},
	});
}

/**
 * Throws synchronously inside `doStream` so the AI SDK propagates the
 * error up to the caller's `await result.text` — used to exercise the
 * `handleIncoming` try/catch and the painter's fallback flushFinal
 * (F-04 belt-and-suspenders for stream failures).
 */
export function mockErrorModel(message = "simulated stream failure"): MockLanguageModelV3 {
	return new MockLanguageModelV3({
		doStream: async () => {
			throw new Error(message);
		},
	});
}

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const textPart = content.find(
		(p): p is { type: "text"; text: string } =>
			typeof p === "object" && p !== null && (p as { type?: string }).type === "text",
	);
	return textPart?.text ?? "";
}
