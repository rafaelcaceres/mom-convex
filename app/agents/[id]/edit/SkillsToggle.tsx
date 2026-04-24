"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Props = {
	agentId: Id<"agents">;
	disabled: boolean;
};

export function SkillsToggle({ agentId, disabled }: Props) {
	const rows = useQuery(api.skills.queries.listCatalogWithBindings.default, { agentId });
	const toggle = useMutation(api.skills.mutations.toggleSkill.default);
	const [pending, setPending] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);

	if (rows === undefined) {
		return <p style={{ color: "#666", fontSize: "0.875rem" }}>Loading…</p>;
	}

	async function onFlip(skillKey: string, currentlyEnabled: boolean) {
		setPending((prev) => new Set(prev).add(skillKey));
		setError(null);
		try {
			await toggle({
				agentId,
				skillKey,
				action: currentlyEnabled ? "disable" : "enable",
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to toggle");
		} finally {
			setPending((prev) => {
				const next = new Set(prev);
				next.delete(skillKey);
				return next;
			});
		}
	}

	if (rows.length === 0) {
		return (
			<p style={{ color: "#666", fontSize: "0.875rem" }}>
				No skills available. Seed the catalog first.
			</p>
		);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
			{error ? <p style={{ color: "#b00020", fontSize: "0.75rem", margin: 0 }}>{error}</p> : null}
			<ul
				style={{
					listStyle: "none",
					margin: 0,
					padding: 0,
					display: "flex",
					flexDirection: "column",
					gap: "0.5rem",
				}}
			>
				{rows.map((row) => {
					const busy = pending.has(row.skillKey);
					return (
						<li
							key={row.skillKey}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "0.5rem 0.75rem",
								border: "1px solid #e5e7eb",
								borderRadius: "0.25rem",
								gap: "1rem",
							}}
						>
							<div>
								<div style={{ fontSize: "0.875rem", fontWeight: 500 }}>
									<code>{row.skillKey}</code>
									{row.sideEffect === "write" ? (
										<span
											style={{
												marginLeft: "0.5rem",
												fontSize: "0.6875rem",
												background: "#fef3c7",
												color: "#92400e",
												padding: "0.125rem 0.375rem",
												borderRadius: "0.25rem",
											}}
										>
											write
										</span>
									) : null}
								</div>
								<div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.125rem" }}>
									{row.description}
								</div>
							</div>
							<label
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: "0.375rem",
									cursor: disabled || busy ? "not-allowed" : "pointer",
								}}
							>
								<input
									type="checkbox"
									data-testid={`skill-toggle-${row.skillKey}`}
									checked={row.enabled}
									onChange={() => onFlip(row.skillKey, row.enabled)}
									disabled={disabled || busy}
								/>
								<span style={{ fontSize: "0.75rem", color: "#555" }}>
									{row.enabled ? "enabled" : "disabled"}
								</span>
							</label>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
