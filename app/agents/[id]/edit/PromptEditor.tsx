"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Props = {
	agentId: Id<"agents">;
	initialPrompt: string;
	disabled: boolean;
};

export function PromptEditor({ agentId, initialPrompt, disabled }: Props) {
	const updateAgent = useMutation(api.agents.mutations.updateAgent.default);
	const [value, setValue] = useState(initialPrompt);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	const trimmed = value.trim();
	const dirty = value !== initialPrompt;

	async function onSave() {
		if (!dirty || saving || !trimmed) return;
		setSaving(true);
		setError(null);
		setSaved(false);
		try {
			await updateAgent({ agentId, systemPrompt: value });
			setSaved(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
			<textarea
				data-testid="prompt-input"
				value={value}
				onChange={(e) => {
					setValue(e.target.value);
					setSaved(false);
				}}
				disabled={disabled || saving}
				rows={8}
				style={{
					padding: "0.5rem",
					border: "1px solid #ccc",
					borderRadius: "0.25rem",
					fontSize: "0.875rem",
					fontFamily: "ui-monospace, Menlo, monospace",
					resize: "vertical",
				}}
			/>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					fontSize: "0.75rem",
					color: "#666",
				}}
			>
				<span>{value.length.toLocaleString()} chars</span>
				<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
					{error ? <span style={{ color: "#b00020" }}>{error}</span> : null}
					{saved && !dirty ? <span style={{ color: "#065f46" }}>Saved</span> : null}
					<button
						type="button"
						onClick={onSave}
						disabled={disabled || saving || !dirty || !trimmed}
						data-testid="prompt-save"
						style={{
							padding: "0.375rem 0.75rem",
							background: disabled || !dirty || !trimmed ? "#d1d5db" : "#111",
							color: "white",
							border: "none",
							borderRadius: "0.25rem",
							cursor: disabled || !dirty || !trimmed ? "not-allowed" : "pointer",
							fontSize: "0.875rem",
						}}
					>
						{saving ? "Saving…" : "Save prompt"}
					</button>
				</div>
			</div>
		</div>
	);
}
