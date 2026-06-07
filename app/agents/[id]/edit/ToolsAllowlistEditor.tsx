"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Props = {
	agentId: Id<"agents">;
	initial: string[];
	disabled: boolean;
};

/**
 * Free-form list of tool-source identifiers the agent is allowed to use
 * outside of the skill catalog. Today the only consumer is `laminar` (remote
 * MCP). Catalog skills have their own toggle and are NOT managed here — this
 * field gates external tool sources whose access policy lives outside the
 * `skillCatalog` × `agentSkills` model.
 */
export function ToolsAllowlistEditor({ agentId, initial, disabled }: Props) {
	const update = useMutation(api.agents.mutations.updateAgent.default);
	const [entries, setEntries] = useState<string[]>(() => Array.from(initial));
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	async function persist(next: string[]) {
		setBusy(true);
		setError(null);
		try {
			await update({ agentId, toolsAllowlist: next });
			setEntries(next);
			setSavedAt(Date.now());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setBusy(false);
		}
	}

	async function onAdd(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmed = draft.trim();
		if (!trimmed) return;
		if (entries.includes(trimmed)) {
			setDraft("");
			return;
		}
		await persist([...entries, trimmed]);
		setDraft("");
	}

	async function onRemove(value: string) {
		await persist(entries.filter((e) => e !== value));
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
			<p style={{ margin: 0, fontSize: "0.75rem", color: "#666" }}>
				External tool sources this agent can access. Add <code>laminar</code> to enable the Laminar
				MCP integration.
			</p>
			{entries.length === 0 ? (
				<p style={{ margin: 0, fontSize: "0.75rem", color: "#999" }}>No external tools enabled.</p>
			) : (
				<ul
					data-testid="tools-allowlist"
					style={{
						listStyle: "none",
						margin: 0,
						padding: 0,
						display: "flex",
						flexWrap: "wrap",
						gap: "0.375rem",
					}}
				>
					{entries.map((entry) => (
						<li
							key={entry}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: "0.375rem",
								padding: "0.25rem 0.5rem",
								background: "#eef2ff",
								border: "1px solid #c7d2fe",
								borderRadius: "0.25rem",
								fontSize: "0.75rem",
							}}
						>
							<code>{entry}</code>
							<button
								type="button"
								data-testid={`tools-allowlist-remove-${entry}`}
								onClick={() => onRemove(entry)}
								disabled={disabled || busy}
								style={{
									border: "none",
									background: "transparent",
									cursor: disabled || busy ? "not-allowed" : "pointer",
									color: "#4338ca",
									fontSize: "0.875rem",
									lineHeight: 1,
									padding: 0,
								}}
								aria-label={`Remove ${entry}`}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}
			<form onSubmit={onAdd} style={{ display: "flex", gap: "0.5rem" }}>
				<input
					type="text"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder="laminar"
					disabled={disabled || busy}
					data-testid="tools-allowlist-input"
					style={{
						flex: 1,
						padding: "0.375rem 0.5rem",
						border: "1px solid #d1d5db",
						borderRadius: "0.25rem",
						fontSize: "0.875rem",
					}}
				/>
				<button
					type="submit"
					disabled={disabled || busy || !draft.trim()}
					data-testid="tools-allowlist-add"
					style={{
						padding: "0.375rem 0.75rem",
						border: "1px solid #d1d5db",
						borderRadius: "0.25rem",
						background: disabled || busy || !draft.trim() ? "#f3f4f6" : "#fff",
						cursor: disabled || busy || !draft.trim() ? "not-allowed" : "pointer",
						fontSize: "0.875rem",
					}}
				>
					Add
				</button>
			</form>
			{error ? (
				<p style={{ margin: 0, fontSize: "0.75rem", color: "#b00020" }}>{error}</p>
			) : savedAt ? (
				<p style={{ margin: 0, fontSize: "0.75rem", color: "#16a34a" }}>Saved.</p>
			) : null}
		</div>
	);
}
