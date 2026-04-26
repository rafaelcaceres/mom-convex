"use client";

import { type UIMessage, useSmoothText, useUIMessages } from "@convex-dev/agent/react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ReasoningCard } from "./ReasoningCard";
import { ToolCallCard } from "./ToolCallCard";

type Props = { threadId: Id<"threads"> };

export function MessageList({ threadId }: Props) {
	// Single source of truth: saved messages + in-flight stream deltas
	// merged by `useUIMessages`. The hook deduplicates by stable `key` so
	// a streaming bubble keeps its identity through the
	// streaming → success transition — no flicker, no double-render.
	const queryResult = useUIMessages(
		// biome-ignore lint/suspicious/noExplicitAny: hook expects threadId: string; ours is branded Id
		api.webChat.queries.listUIMessages.default as any,
		{ threadId },
		{ initialNumItems: 200, stream: true },
	);
	// Cast through the structural minimum the hook exposes back to the
	// full UIMessage shape — same runtime payload (`text`, `key`, `parts`,
	// `status`, `role` all present), just lost in the generic inference
	// because of the `as any` boundary above.
	const messages = queryResult.results as unknown as UIMessage[];
	const status = queryResult.status;
	const bottomRef = useRef<HTMLDivElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages.length, messages[messages.length - 1]?.text]);

	if (status === "LoadingFirstPage") {
		return <div style={{ flex: 1, padding: "1rem 1.25rem", color: "#888" }}>Loading messages…</div>;
	}

	return (
		<div
			style={{
				flex: 1,
				overflowY: "auto",
				padding: "1rem 1.25rem",
				display: "flex",
				flexDirection: "column",
				gap: "0.5rem",
			}}
		>
			{messages.length === 0 ? (
				<p style={{ color: "#888" }}>No messages yet. Say hi.</p>
			) : (
				messages.map((m) => <MessageView key={m.key} message={m} />)
			)}
			<div ref={bottomRef} />
		</div>
	);
}

function MessageView({ message }: { message: UIMessage }) {
	if (message.role === "user") {
		return <UserBubble text={message.text} />;
	}
	if (message.role === "system") {
		// Don't render system prompts in chat (they're config, not conversation).
		return null;
	}
	return <AssistantStack message={message} />;
}

function UserBubble({ text }: { text: string }) {
	return (
		<div
			data-testid="event-user"
			style={{
				alignSelf: "flex-end",
				maxWidth: "75%",
				background: "#111",
				color: "white",
				padding: "0.5rem 0.75rem",
				borderRadius: "0.75rem",
				fontSize: "0.875rem",
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
			}}
		>
			{text}
		</div>
	);
}

/**
 * Renders an assistant message as a vertical stack of parts in the order
 * they were emitted (text, reasoning, tool calls — chronological per the
 * model's stream). Each text part smooth-types while the parent message
 * is `streaming`; once the message saves, smoothing finishes and the
 * cursor goes away. The same React `key` (UIMessage.key) keeps state
 * across that transition so there's no remount.
 */
function AssistantStack({ message }: { message: UIMessage }) {
	const isStreaming = message.status === "streaming";

	// Coalesce consecutive parts of the same type so we render fewer
	// bubbles when the model alternates rapidly during streaming.
	type Segment =
		| { kind: "text"; text: string; idx: number }
		| { kind: "reasoning"; text: string; idx: number }
		| { kind: "tool"; part: ToolPart; idx: number };
	const segments: Segment[] = [];
	for (let i = 0; i < message.parts.length; i++) {
		const part = message.parts[i];
		if (!part) continue;
		if (part.type === "text") {
			const tail = segments[segments.length - 1];
			if (tail && tail.kind === "text") {
				tail.text += part.text;
			} else {
				segments.push({ kind: "text", text: part.text, idx: i });
			}
		} else if (part.type === "reasoning") {
			const tail = segments[segments.length - 1];
			if (tail && tail.kind === "reasoning") {
				tail.text += part.text;
			} else {
				segments.push({ kind: "reasoning", text: part.text, idx: i });
			}
		} else if (isToolPart(part)) {
			segments.push({ kind: "tool", part, idx: i });
		}
	}

	if (segments.length === 0 && isStreaming) {
		// Empty assistant placeholder while waiting for the first delta.
		return <AssistantText text="" isStreaming={true} />;
	}

	return (
		<>
			{segments.map((seg) => {
				if (seg.kind === "text") {
					return (
						<AssistantText
							key={`${message.key}:t:${seg.idx}`}
							text={seg.text}
							isStreaming={isStreaming}
						/>
					);
				}
				if (seg.kind === "reasoning") {
					return (
						<ReasoningCard
							key={`${message.key}:r:${seg.idx}`}
							text={seg.text}
							autoExpanded={isStreaming}
						/>
					);
				}
				const adapted = adaptToolPart(seg.part);
				return (
					<ToolCallCard
						key={`${message.key}:tool:${adapted.toolCallId}`}
						toolCallId={adapted.toolCallId}
						toolName={adapted.toolName}
						argsJson={adapted.argsJson}
						status={adapted.status}
						result={adapted.result}
					/>
				);
			})}
		</>
	);
}

function AssistantText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
	const [smooth] = useSmoothText(text, { startStreaming: isStreaming, charsPerSec: 96 });
	return (
		<div
			data-testid="event-assistant"
			data-streaming={isStreaming ? "true" : "false"}
			className="assistant-md"
			style={{
				alignSelf: "flex-start",
				maxWidth: "75%",
				background: "#f3f4f6",
				color: "#111",
				padding: "0.5rem 0.75rem",
				borderRadius: "0.75rem",
				fontSize: "0.875rem",
				wordBreak: "break-word",
			}}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
				{smooth}
			</ReactMarkdown>
			{isStreaming ? (
				<span
					aria-hidden
					data-testid="streaming-cursor"
					style={{
						display: "inline-block",
						width: "0.4em",
						height: "0.9em",
						marginLeft: "0.125rem",
						verticalAlign: "text-bottom",
						background: "#9ca3af",
						animation: "streamingCursorBlink 1s steps(2) infinite",
					}}
				/>
			) : null}
			<style>{ASSISTANT_MD_CSS}</style>
		</div>
	);
}

// Inline styles + scoped CSS for markdown elements. Tight vertical
// rhythm so a multi-paragraph reply doesn't blow past the bubble
// padding; matches Claude / ChatGPT defaults closely enough.
const MARKDOWN_COMPONENTS = {
	a: (props: React.ComponentProps<"a">) => (
		<a {...props} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }} />
	),
};

const ASSISTANT_MD_CSS = `
@keyframes streamingCursorBlink { 50% { opacity: 0; } }
.assistant-md > :first-child { margin-top: 0; }
.assistant-md > :last-child { margin-bottom: 0; }
.assistant-md p { margin: 0.4em 0; line-height: 1.45; }
.assistant-md h1, .assistant-md h2, .assistant-md h3, .assistant-md h4 {
	margin: 0.6em 0 0.3em;
	line-height: 1.25;
	font-weight: 600;
}
.assistant-md h1 { font-size: 1.15rem; }
.assistant-md h2 { font-size: 1.05rem; }
.assistant-md h3 { font-size: 0.95rem; }
.assistant-md h4 { font-size: 0.875rem; }
.assistant-md ul, .assistant-md ol { margin: 0.4em 0; padding-left: 1.4em; }
.assistant-md li { margin: 0.15em 0; line-height: 1.45; }
.assistant-md li > p { margin: 0; }
.assistant-md code {
	background: #e5e7eb;
	padding: 0.05em 0.3em;
	border-radius: 0.25em;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 0.8125rem;
}
.assistant-md pre {
	background: #1f2937;
	color: #f9fafb;
	padding: 0.6em 0.75em;
	border-radius: 0.4em;
	overflow-x: auto;
	margin: 0.5em 0;
	font-size: 0.8125rem;
	line-height: 1.45;
}
.assistant-md pre code { background: transparent; padding: 0; color: inherit; font-size: inherit; }
.assistant-md blockquote {
	border-left: 3px solid #d1d5db;
	margin: 0.5em 0;
	padding: 0.1em 0.75em;
	color: #4b5563;
}
.assistant-md table {
	border-collapse: collapse;
	margin: 0.5em 0;
	font-size: 0.8125rem;
}
.assistant-md th, .assistant-md td {
	border: 1px solid #e5e7eb;
	padding: 0.25em 0.5em;
	text-align: left;
}
.assistant-md th { background: #e5e7eb; font-weight: 600; }
.assistant-md hr { border: none; border-top: 1px solid #e5e7eb; margin: 0.75em 0; }
.assistant-md strong { font-weight: 600; }
.assistant-md em { font-style: italic; }
`;

// --- Tool part adaptation -------------------------------------------------

type ToolPart = {
	type: string;
	toolCallId: string;
	toolName?: string;
	state?:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error"
		| "approval-requested"
		| "approval-responded";
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

function isToolPart(part: { type: string }): part is ToolPart {
	return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function getToolName(part: ToolPart): string {
	if (part.toolName) return part.toolName;
	// Static tool parts encode the name as `tool-${name}`.
	if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
	return "tool";
}

function adaptToolPart(part: ToolPart): {
	toolCallId: string;
	toolName: string;
	argsJson: string;
	status: "running" | "done" | "error";
	result?: { outputJson: string; isError: boolean };
} {
	const status: "running" | "done" | "error" =
		part.state === "output-error"
			? "error"
			: part.state === "output-available"
				? "done"
				: "running";
	const result =
		part.state === "output-available"
			? { outputJson: safeStringify(part.output), isError: false }
			: part.state === "output-error"
				? {
						outputJson: safeStringify(part.errorText ?? part.output ?? "error"),
						isError: true,
					}
				: undefined;
	return {
		toolCallId: part.toolCallId,
		toolName: getToolName(part),
		argsJson: safeStringify(part.input ?? null),
		status,
		result,
	};
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value ?? null);
	} catch {
		return JSON.stringify(String(value));
	}
}
