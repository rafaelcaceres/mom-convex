"use client";

import { useState } from "react";

type Props = {
	toolCallId: string;
	toolName: string;
	argsJson: string;
	status: "running" | "done" | "error";
	result?: { outputJson: string; isError: boolean };
};

function formatJson(raw: string): string {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
}

export function ToolCallCard({ toolCallId, toolName, argsJson, status, result }: Props) {
	const [open, setOpen] = useState(false);
	const isRunning = status === "running" || (!result && status !== "error");
	const isError = status === "error" || (result?.isError ?? false);

	const badgeColor = isError ? "#b91c1c" : isRunning ? "#a16207" : "#15803d";
	const badgeBg = isError ? "#fee2e2" : isRunning ? "#fef9c3" : "#dcfce7";

	return (
		<details
			data-testid="tool-call-card"
			data-tool-call-id={toolCallId}
			data-status={status}
			open={open}
			onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
			style={{
				alignSelf: "stretch",
				border: "1px solid #e5e7eb",
				borderRadius: "0.5rem",
				background: "white",
				fontSize: "0.8125rem",
			}}
		>
			<summary
				style={{
					cursor: "pointer",
					padding: "0.5rem 0.75rem",
					display: "flex",
					alignItems: "center",
					gap: "0.5rem",
					listStyle: "none",
				}}
			>
				<span style={{ fontWeight: 600 }}>{toolName}</span>
				<span
					data-testid="tool-call-status"
					style={{
						background: badgeBg,
						color: badgeColor,
						padding: "0.125rem 0.5rem",
						borderRadius: "0.75rem",
						fontSize: "0.6875rem",
						fontWeight: 600,
						textTransform: "uppercase",
						letterSpacing: "0.05em",
					}}
				>
					{isRunning ? "running…" : isError ? "error" : "done"}
				</span>
				<code style={{ marginLeft: "auto", color: "#6b7280", fontSize: "0.6875rem" }}>
					{toolCallId.slice(0, 8)}
				</code>
			</summary>
			<div style={{ padding: "0 0.75rem 0.75rem", display: "grid", gap: "0.5rem" }}>
				<section>
					<header style={{ color: "#6b7280", fontSize: "0.6875rem", textTransform: "uppercase" }}>
						args
					</header>
					<pre
						data-testid="tool-call-args"
						style={{
							background: "#f9fafb",
							padding: "0.5rem",
							borderRadius: "0.25rem",
							overflowX: "auto",
							margin: 0,
							fontSize: "0.75rem",
						}}
					>
						{formatJson(argsJson)}
					</pre>
				</section>
				<section>
					<header style={{ color: "#6b7280", fontSize: "0.6875rem", textTransform: "uppercase" }}>
						result
					</header>
					{result ? (
						<pre
							data-testid="tool-call-result"
							style={{
								background: isError ? "#fef2f2" : "#f9fafb",
								padding: "0.5rem",
								borderRadius: "0.25rem",
								overflowX: "auto",
								margin: 0,
								fontSize: "0.75rem",
							}}
						>
							{formatJson(result.outputJson)}
						</pre>
					) : (
						<p
							data-testid="tool-call-running"
							style={{ margin: 0, color: "#a16207", fontStyle: "italic" }}
						>
							_running…_
						</p>
					)}
				</section>
			</div>
		</details>
	);
}
