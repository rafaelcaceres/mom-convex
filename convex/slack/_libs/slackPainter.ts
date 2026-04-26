import { markdownToMrkdwn } from "./markdownToMrkdwn";
import { postSlackMessage, updateSlackMessage } from "./slackPoster";
import { splitMrkdwnIntoChunks } from "./splitMrkdwn";

/**
 * Live-edit painter for the bot's main Slack message in a single turn (F-04).
 *
 * Behaviour mirrors `docs/pi-mono/packages/mom`'s "terminal" feel: as the
 * agent streams, the painter accumulates segments (text deltas, tool-call
 * markers, reasoning snippets) and edits the same message in place. The
 * first write is a `chat.postMessage` (captures `ts`); every subsequent
 * write is `chat.update` on that ts.
 *
 * Pacing is event-driven (not time-throttled) so the message feels
 * snappy on fast streams. While a write is in flight, subsequent state
 * changes flip a `dirty` flag; when the write resolves, one fresh write
 * is dispatched carrying the cumulative state. The promise chain is the
 * only rate-limiter — Slack chat.update typically takes ~200-400ms, so
 * the natural cadence is ~3 updates/s, well under Slack's ~1 msg/s soft
 * cap once 429 retry kicks in.
 *
 * Tool-call detail (args + output) and full reasoning text continue to be
 * posted as thread replies by the caller — the painter only renders short
 * inline markers in the main message.
 */

type Segment =
	| { kind: "text"; text: string }
	| { kind: "tool"; toolCallId: string; toolName: string; state: "running" | "ok" | "error" }
	| { kind: "reasoning"; snippet: string };

/**
 * Slack's documented `text` cap is 40 000, but `chat.update`/`chat.postMessage`
 * reject single-text-field payloads above ~4 000 chars with `msg_too_long`.
 * Keep the live render under this so updates never fail; longer final text
 * is split into thread-reply continuations by `flushFinal`.
 */
const SLACK_TEXT_LIMIT = 3900;
const REASONING_SNIPPET_LIMIT = 120;

/**
 * Strips inline markdown from a string so it can safely sit inside a
 * Slack mrkdwn wrapper (e.g. `_${stripped}_` for italic). Without this,
 * a reasoning snippet like `**Locating Lacan's Question**` would land in
 * Slack as `_**Locating Lacan's Question**_` with literal asterisks
 * visible.
 */
function stripInlineMarkdown(s: string): string {
	return s
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/~~([^~]+)~~/g, "$1")
		.replace(/^#{1,6}\s+/gm, "");
}

export interface CreateSlackPainterArgs {
	botToken: string;
	channelId: string;
	/** Slack thread ts at the channel level (the user's thread, not the bot anchor). */
	threadTs?: string;
	/**
	 * Called once with the freshly captured `ts` from the first
	 * `chat.postMessage`. Caller persists it on the thread binding so a
	 * retried turn doesn't lose the anchor.
	 */
	persistMainTs: (ts: string) => Promise<void>;
	// Test seams.
	postFn?: typeof postSlackMessage;
	updateFn?: typeof updateSlackMessage;
}

export interface SlackPainter {
	/**
	 * Eagerly posts the initial anchor message (an empty live render)
	 * so `getMainTs()` is populated before any stream chunks arrive.
	 * Without this, thread replies fired from `onStepFinish` could race
	 * against the very first `chat.postMessage` and leak as top-level
	 * channel messages (no anchor yet captured). Returns the captured
	 * `ts` once the post completes.
	 */
	start(): Promise<string | null>;
	appendText(delta: string): void;
	markToolStart(args: { toolCallId: string; toolName: string }): void;
	markToolEnd(args: { toolCallId: string; ok: boolean }): void;
	markReasoning(snippet: string): void;
	setWorking(value: boolean): void;
	flushFinal(finalMrkdwn: string): Promise<void>;
	/**
	 * Final flush using Slack Block Kit `rich_text` instead of mrkdwn `text`.
	 * Renders the agent's output via a structured AST (no string-level
	 * markdown→mrkdwn translation), which is the only way to get reliable
	 * Slack rendering for nested lists, code blocks, links, etc.
	 * `fallbackText` is passed in the `text` field for desktop notifications
	 * and accessibility tooling.
	 */
	flushFinalBlocks(args: { blocks: unknown[]; fallbackText: string }): Promise<void>;
	getMainTs(): string | null;
}

export function buildReasoningSnippet(reasoningText: string): string {
	const firstLine = reasoningText
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l.length > 0);
	if (!firstLine) return "";
	if (firstLine.length <= REASONING_SNIPPET_LIMIT) return firstLine;
	return `${firstLine.slice(0, REASONING_SNIPPET_LIMIT - 1)}…`;
}

export function createSlackPainter(args: CreateSlackPainterArgs): SlackPainter {
	const postFn = args.postFn ?? postSlackMessage;
	const updateFn = args.updateFn ?? updateSlackMessage;

	let mainTs: string | null = null;
	const segments: Segment[] = [];
	let pendingText = "";
	let working = true;
	let placeholderActive = false;
	let updateChain: Promise<void> = Promise.resolve();
	let writeInFlight = false;
	let dirty = false;
	let finalized = false;

	function flushPendingText(): void {
		if (pendingText.length === 0) return;
		segments.push({ kind: "text", text: pendingText });
		pendingText = "";
	}

	function renderLive(): string {
		// Build the entire live document as raw markdown, then convert
		// to mrkdwn ONCE at the end. This lets bold/italic pairs span
		// segment boundaries (text → tool marker → continued text)
		// without per-segment conversion losing the closing marker.
		// Tool markers and reasoning snippets are pre-wrapped in mrkdwn
		// italic (`_..._`) which markdownToMrkdwn passes through unchanged
		// — markdown italic uses `*...*`, not `_..._`.
		const parts: string[] = [];
		for (const s of segments) {
			if (s.kind === "text") parts.push(s.text);
			else if (s.kind === "tool") {
				const prefix = s.state === "running" ? "→" : s.state === "ok" ? "✓" : "✗";
				parts.push(`_${prefix} ${s.toolName}_`);
			} else parts.push(`_${stripInlineMarkdown(s.snippet)}_`);
		}
		if (pendingText.length > 0) parts.push(pendingText);
		let text = parts.join("\n");
		if (text.length === 0 && placeholderActive) {
			text = "_thinking..._";
		} else {
			text = markdownToMrkdwn(text);
			if (working) text = text.length > 0 ? `${text}\n…` : "…";
		}
		if (text.length > SLACK_TEXT_LIMIT) {
			// Keep the *tail* during streaming so the user sees what's being
			// written now, not a frozen prefix. The full text lands as
			// thread-reply continuations during `flushFinal`.
			const prefix = "_(…anterior cortado, mensagem completa ao final)_\n\n";
			text = `${prefix}${text.slice(text.length - (SLACK_TEXT_LIMIT - prefix.length))}`;
		}
		return text;
	}

	function doWrite(text: string): Promise<void> {
		return (async () => {
			try {
				if (mainTs === null) {
					const ts = await postFn({
						botToken: args.botToken,
						channel: args.channelId,
						threadTs: args.threadTs,
						text,
					});
					mainTs = ts;
					await args.persistMainTs(ts);
				} else {
					await updateFn({
						botToken: args.botToken,
						channel: args.channelId,
						ts: mainTs,
						text,
					});
				}
			} catch (err) {
				// Don't abort the turn on a Slack hiccup — log and let the next
				// scheduled write try again. The final flushFinal also runs
				// through the chain, so a transient failure usually self-heals
				// before the user sees the polished final text.
				console.warn("[slackPainter] write failed", err);
			}
		})();
	}

	function scheduleFlush(): void {
		if (finalized) return;
		if (writeInFlight) {
			dirty = true;
			return;
		}
		writeInFlight = true;
		dirty = false;
		const text = renderLive();
		updateChain = updateChain
			.then(() => doWrite(text))
			.then(() => {
				writeInFlight = false;
				if (dirty && !finalized) scheduleFlush();
			});
	}

	return {
		appendText(delta: string): void {
			if (finalized || delta.length === 0) return;
			placeholderActive = false;
			pendingText += delta;
			scheduleFlush();
		},

		markToolStart({ toolCallId, toolName }): void {
			if (finalized) return;
			placeholderActive = false;
			flushPendingText();
			segments.push({ kind: "tool", toolCallId, toolName, state: "running" });
			scheduleFlush();
		},

		markToolEnd({ toolCallId, ok }): void {
			if (finalized) return;
			for (let i = segments.length - 1; i >= 0; i -= 1) {
				const s = segments[i];
				if (s?.kind === "tool" && s.toolCallId === toolCallId && s.state === "running") {
					s.state = ok ? "ok" : "error";
					break;
				}
			}
			scheduleFlush();
		},

		markReasoning(snippet: string): void {
			if (finalized) return;
			const trimmed = snippet.trim();
			if (trimmed.length === 0) return;
			placeholderActive = false;
			flushPendingText();
			segments.push({ kind: "reasoning", snippet: trimmed });
			scheduleFlush();
		},

		setWorking(value: boolean): void {
			if (finalized) return;
			if (working === value) return;
			working = value;
			scheduleFlush();
		},

		async flushFinal(finalMrkdwn: string): Promise<void> {
			finalized = true;
			working = false;
			const chunks = splitMrkdwnIntoChunks(finalMrkdwn, SLACK_TEXT_LIMIT);
			updateChain = updateChain
				.then(() => doWrite(chunks[0] ?? ""))
				.then(async () => {
					// Continuations land as thread replies anchored on the bot's
					// main message ts. If `mainTs` is somehow still null (the
					// first write failed and was retried as a post), the
					// continuations will fall back to the user's threadTs — same
					// channel, just less visually grouped.
					const anchor = mainTs ?? args.threadTs;
					for (let i = 1; i < chunks.length; i += 1) {
						const piece = chunks[i];
						if (piece === undefined) continue;
						try {
							await postFn({
								botToken: args.botToken,
								channel: args.channelId,
								threadTs: anchor,
								text: piece,
							});
						} catch (err) {
							console.warn("[slackPainter] continuation post failed", err);
						}
					}
				});
			await updateChain;
		},

		async flushFinalBlocks({
			blocks,
			fallbackText,
		}: { blocks: unknown[]; fallbackText: string }): Promise<void> {
			finalized = true;
			working = false;
			updateChain = updateChain.then(async () => {
				try {
					if (mainTs === null) {
						const ts = await postFn({
							botToken: args.botToken,
							channel: args.channelId,
							threadTs: args.threadTs,
							text: fallbackText,
							blocks,
						});
						mainTs = ts;
						await args.persistMainTs(ts);
					} else {
						await updateFn({
							botToken: args.botToken,
							channel: args.channelId,
							ts: mainTs,
							text: fallbackText,
							blocks,
						});
					}
				} catch (err) {
					console.warn("[slackPainter] flushFinalBlocks failed", err);
				}
			});
			await updateChain;
		},

		getMainTs(): string | null {
			return mainTs;
		},

		async start(): Promise<string | null> {
			if (finalized) return mainTs;
			placeholderActive = true;
			scheduleFlush();
			await updateChain;
			return mainTs;
		},
	};
}
