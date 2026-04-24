"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { MemoryEditor } from "./MemoryEditor";
import { ModelSelector } from "./ModelSelector";
import { PromptEditor } from "./PromptEditor";
import { SkillsToggle } from "./SkillsToggle";

type Props = { agentId: Id<"agents"> };

export function AgentEditor({ agentId }: Props) {
	const agent = useQuery(api.agents.queries.getById.default, { agentId });
	// Roles scoped to the agent's org — fetched conditionally once we know the orgId.
	const roles = useQuery(
		api.tenants.getUserRoles,
		agent ? { organizationId: agent.orgId } : "skip",
	) as Array<{ role: string }> | undefined;

	if (agent === undefined || (agent && roles === undefined)) {
		return <p style={{ color: "#666" }}>Loading…</p>;
	}

	if (agent === null) {
		return (
			<div>
				<h2 style={{ marginTop: 0 }}>Agent not found</h2>
				<p style={{ color: "#555" }}>This agent doesn't exist, or you don't have access to it.</p>
			</div>
		);
	}

	const isAdmin =
		Array.isArray(roles) && roles.some((r) => r.role === "admin" || r.role === "owner");

	return (
		<div
			style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
			data-testid="agent-editor"
		>
			<div>
				<h2 style={{ margin: 0 }}>{agent.name}</h2>
				<p style={{ margin: "0.25rem 0 0", color: "#666", fontSize: "0.875rem" }}>
					Slug: <code>{agent.slug}</code>
					{agent.isDefault ? <span style={{ marginLeft: "0.5rem" }}>· default</span> : null}
				</p>
				{!isAdmin ? (
					<p
						data-testid="read-only-banner"
						style={{
							marginTop: "0.75rem",
							padding: "0.5rem 0.75rem",
							background: "#fef9c3",
							border: "1px solid #eab308",
							borderRadius: "0.25rem",
							color: "#713f12",
							fontSize: "0.875rem",
						}}
					>
						Read-only. Only workspace admins can edit agents.
					</p>
				) : null}
			</div>

			<Section title="System prompt">
				<PromptEditor agentId={agent._id} initialPrompt={agent.systemPrompt} disabled={!isAdmin} />
			</Section>

			<Section title="Model">
				<ModelSelector agentId={agent._id} initialModelId={agent.modelId} disabled={!isAdmin} />
			</Section>

			<Section title="Skills">
				<SkillsToggle agentId={agent._id} disabled={!isAdmin} />
			</Section>

			<Section title="Memory">
				<MemoryEditor agentId={agent._id} orgId={agent.orgId} disabled={!isAdmin} />
			</Section>
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
			<h3 style={{ margin: 0, fontSize: "1rem" }}>{title}</h3>
			{children}
		</section>
	);
}
