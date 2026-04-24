"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SUPPORTED_MODELS } from "../../../../convex/agents/_libs/supportedModels";

type Props = {
	agentId: Id<"agents">;
	initialModelId: string;
	disabled: boolean;
};

export function ModelSelector({ agentId, initialModelId, disabled }: Props) {
	const updateAgent = useMutation(api.agents.mutations.updateAgent.default);
	const [value, setValue] = useState(initialModelId);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// If the stored modelId isn't in the catalog (e.g. recently removed), keep
	// it in the dropdown as a pinned "legacy" option so the owner can see what's
	// active and switch off it deliberately.
	const legacy = SUPPORTED_MODELS.find((m) => m.modelId === initialModelId) ? null : initialModelId;

	async function onChange(next: string) {
		if (next === value || saving) return;
		setValue(next);
		setSaving(true);
		setError(null);
		try {
			await updateAgent({ agentId, modelId: next });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save");
			setValue(initialModelId);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
			<select
				data-testid="model-select"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled || saving}
				style={{
					padding: "0.5rem",
					border: "1px solid #ccc",
					borderRadius: "0.25rem",
					fontSize: "0.875rem",
					background: "#fff",
				}}
			>
				{legacy ? <option value={legacy}>{legacy} (legacy)</option> : null}
				{SUPPORTED_MODELS.map((m) => (
					<option key={m.modelId} value={m.modelId}>
						{m.label}
					</option>
				))}
			</select>
			{error ? <p style={{ color: "#b00020", fontSize: "0.75rem", margin: 0 }}>{error}</p> : null}
		</div>
	);
}
