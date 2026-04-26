"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { SUPPORTED_MODELS } from "../../convex/agents/_libs/supportedModels";

/**
 * In-chat model picker. ChatGPT/Claude/Manus pattern: dropdown next to
 * the title that swaps the active model without leaving the conversation.
 *
 * Targets the org's default agent (the one /chat uses). Persistent —
 * change applies to every subsequent turn from this agent across all
 * threads, mirroring how the upstream products treat the model
 * selection as a session-wide preference rather than a per-message
 * choice. If we later need per-thread overrides, that's a separate
 * field on the thread; this picker stays as the agent-wide default.
 */
export function ModelPicker() {
	const orgs = useQuery(api.tenants.listOrganizations, {});
	const orgId = orgs?.[0]?._id;
	const agent = useQuery(api.agents.queries.getDefault.default, orgId ? { orgId } : "skip");
	const setModel = useMutation(api.agents.mutations.setAgentModel.default);
	const [pending, setPending] = useState(false);

	if (!agent) return null;

	const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
		const modelId = e.target.value;
		if (modelId === agent.modelId) return;
		setPending(true);
		try {
			await setModel({ agentId: agent._id, modelId });
		} finally {
			setPending(false);
		}
	};

	return (
		<select
			data-testid="model-picker"
			aria-label="Model"
			value={agent.modelId}
			onChange={onChange}
			disabled={pending}
			style={{
				padding: "0.375rem 0.5rem",
				background: "#fff",
				color: "#111",
				border: "1px solid #d1d5db",
				borderRadius: "0.25rem",
				fontSize: "0.875rem",
				cursor: pending ? "wait" : "pointer",
				opacity: pending ? 0.6 : 1,
			}}
		>
			{/* Show the current model even if it's no longer in the catalog (legacy
			    rows from before a model was retired) so the user sees the truth
			    instead of the dropdown silently re-selecting the first option. */}
			{!SUPPORTED_MODELS.some((m) => m.modelId === agent.modelId) ? (
				<option value={agent.modelId}>{agent.modelId} (legacy)</option>
			) : null}
			{SUPPORTED_MODELS.map((m) => (
				<option key={m.modelId} value={m.modelId}>
					{m.label}
				</option>
			))}
		</select>
	);
}
