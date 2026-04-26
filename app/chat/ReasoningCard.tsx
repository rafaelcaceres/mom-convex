"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
	text: string;
	/**
	 * When true, the card auto-opens on mount and stays open while
	 * `autoExpanded` is true (used while the parent message is still
	 * streaming so the user watches the model think live). Once the
	 * stream finishes and the parent flips `autoExpanded` to false, the
	 * card collapses to the "Thought for N words" summary unless the
	 * user has manually toggled it.
	 *
	 * No smooth-typing here: reasoning lands from the agent component as
	 * one big save (the AI SDK's `smoothStream` transform only
	 * word-chunks `text-delta`, not `reasoning-delta`), so any
	 * client-side reveal is fictitious cadence layered on a single
	 * server event. We render whatever the server has, when it has it.
	 */
	autoExpanded?: boolean;
};

/**
 * Collapsed-by-default chain-of-thought card. Visual language matches
 * Claude Desktop / Manus: muted "Thought" header with a chevron, body
 * expands into a muted gray block with a left border. Markdown is
 * rendered (headings, lists, code, emphasis) so the model's
 * step-by-step reasoning reads structured rather than as a wall of
 * text. The muted palette + left rule is what flags it as
 * meta-content; we don't italicize prose anymore because it'd fight
 * markdown emphasis.
 *
 * Word count is a cheap proxy for "this took some thinking" and gives
 * the user a hint of weight without forcing them to expand.
 */
export function ReasoningCard({ text, autoExpanded = false }: Props) {
	const [open, setOpen] = useState(autoExpanded);
	// Track manual override so the auto-collapse on stream finish doesn't
	// clobber a user who explicitly opened the card.
	const [userToggled, setUserToggled] = useState(false);

	useEffect(() => {
		if (!userToggled) setOpen(autoExpanded);
	}, [autoExpanded, userToggled]);

	const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

	return (
		<details
			data-testid="reasoning-card"
			open={open}
			onToggle={(e) => {
				setOpen((e.target as HTMLDetailsElement).open);
				setUserToggled(true);
			}}
			style={{
				alignSelf: "flex-start",
				maxWidth: "75%",
				background: "transparent",
				fontSize: "0.8125rem",
				color: "#6b7280",
			}}
		>
			<summary
				style={{
					cursor: "pointer",
					padding: "0.25rem 0.5rem",
					display: "flex",
					alignItems: "center",
					gap: "0.375rem",
					listStyle: "none",
					userSelect: "none",
				}}
			>
				<span
					aria-hidden
					style={{
						display: "inline-block",
						transform: open ? "rotate(90deg)" : "rotate(0deg)",
						transition: "transform 120ms ease",
						fontSize: "0.625rem",
						color: "#9ca3af",
					}}
				>
					▶
				</span>
				<span style={{ fontStyle: "italic" }}>
					{open ? "Hide thinking" : `Thought for ${wordCount} word${wordCount === 1 ? "" : "s"}`}
				</span>
			</summary>
			<div
				data-testid="reasoning-body"
				className="reasoning-md"
				style={{
					marginTop: "0.25rem",
					padding: "0.5rem 0.75rem",
					borderLeft: "2px solid #e5e7eb",
					marginLeft: "0.5rem",
					color: "#6b7280",
					wordBreak: "break-word",
					lineHeight: 1.5,
				}}
			>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{
						a: (props) => (
							<a
								{...props}
								target="_blank"
								rel="noopener noreferrer"
								style={{ color: "#4b5563" }}
							/>
						),
					}}
				>
					{text}
				</ReactMarkdown>
				<style>{REASONING_MD_CSS}</style>
			</div>
		</details>
	);
}

// Muted-tone markdown styles for the reasoning panel. Mirrors the
// assistant bubble's structure (headings/lists/code/blockquote) but
// at smaller sizes and gray palette so the card still reads as
// meta-content next to the answer.
const REASONING_MD_CSS = `
.reasoning-md > :first-child { margin-top: 0; }
.reasoning-md > :last-child { margin-bottom: 0; }
.reasoning-md p { margin: 0.35em 0; }
.reasoning-md h1, .reasoning-md h2, .reasoning-md h3, .reasoning-md h4 {
	margin: 0.5em 0 0.25em;
	line-height: 1.25;
	font-weight: 600;
	color: #4b5563;
}
.reasoning-md h1 { font-size: 0.95rem; }
.reasoning-md h2 { font-size: 0.9rem; }
.reasoning-md h3 { font-size: 0.85rem; }
.reasoning-md h4 { font-size: 0.8125rem; }
.reasoning-md ul, .reasoning-md ol { margin: 0.35em 0; padding-left: 1.4em; }
.reasoning-md li { margin: 0.1em 0; }
.reasoning-md li > p { margin: 0; }
.reasoning-md code {
	background: #e5e7eb;
	padding: 0.05em 0.3em;
	border-radius: 0.25em;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 0.75rem;
	color: #374151;
}
.reasoning-md pre {
	background: #f3f4f6;
	color: #1f2937;
	padding: 0.5em 0.65em;
	border-radius: 0.4em;
	overflow-x: auto;
	margin: 0.4em 0;
	font-size: 0.75rem;
	line-height: 1.45;
}
.reasoning-md pre code { background: transparent; padding: 0; color: inherit; font-size: inherit; }
.reasoning-md blockquote {
	border-left: 2px solid #d1d5db;
	margin: 0.4em 0;
	padding: 0.05em 0.6em;
	color: #6b7280;
}
.reasoning-md table {
	border-collapse: collapse;
	margin: 0.4em 0;
	font-size: 0.75rem;
}
.reasoning-md th, .reasoning-md td {
	border: 1px solid #e5e7eb;
	padding: 0.2em 0.45em;
	text-align: left;
}
.reasoning-md th { background: #e5e7eb; font-weight: 600; }
.reasoning-md hr { border: none; border-top: 1px solid #e5e7eb; margin: 0.6em 0; }
.reasoning-md strong { font-weight: 600; color: #4b5563; }
.reasoning-md em { font-style: italic; }
`;
