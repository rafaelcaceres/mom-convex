"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Props = {
	agentId: Id<"agents">;
	orgId: string;
	disabled: boolean;
};

type Scope = "org" | "agent";

export function MemoryEditor({ agentId, orgId, disabled }: Props) {
	const memories = useQuery(api.memory.queries.listForAgent.default, { agentId });
	const upsert = useMutation(api.memory.mutations.upsertMemory.default);
	const remove = useMutation(api.memory.mutations.deleteMemory.default);

	const [draftContent, setDraftContent] = useState("");
	const [draftScope, setDraftScope] = useState<Scope>("agent");
	const [draftAlwaysOn, setDraftAlwaysOn] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<Id<"memory"> | null>(null);

	if (memories === undefined) {
		return <p style={{ color: "#666", fontSize: "0.875rem" }}>Loading…</p>;
	}

	async function onAdd() {
		const content = draftContent.trim();
		if (!content || saving) return;
		setSaving(true);
		setError(null);
		try {
			await upsert({
				orgId,
				scope: draftScope,
				agentId: draftScope === "agent" ? agentId : undefined,
				content,
				alwaysOn: draftAlwaysOn,
			});
			setDraftContent("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add memory");
		} finally {
			setSaving(false);
		}
	}

	async function onToggleAlwaysOn(
		id: Id<"memory">,
		current: boolean,
		content: string,
		scope: Scope | "thread",
	) {
		if (scope === "thread") return;
		setPendingId(id);
		setError(null);
		try {
			await upsert({
				id,
				orgId,
				scope,
				agentId: scope === "agent" ? agentId : undefined,
				content,
				alwaysOn: !current,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update");
		} finally {
			setPendingId(null);
		}
	}

	async function onDelete(id: Id<"memory">) {
		if (!window.confirm("Delete this memory?")) return;
		setPendingId(id);
		setError(null);
		try {
			await remove({ id });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete");
		} finally {
			setPendingId(null);
		}
	}

	// Thread-scoped rows don't belong on an agent-edit screen; `listForAgent`
	// already filters them out server-side, but guard here too so a future
	// schema tweak doesn't leak them.
	const visible = memories.filter((m) => m.scope === "org" || m.scope === "agent");

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
			{error ? <p style={{ color: "#b00020", fontSize: "0.75rem", margin: 0 }}>{error}</p> : null}

			{visible.length === 0 ? (
				<p style={{ color: "#666", fontSize: "0.875rem", margin: 0 }}>
					No memories yet. Add one below.
				</p>
			) : (
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
					{visible.map((m) => {
						const busy = pendingId === m._id;
						return (
							<li
								key={m._id}
								data-testid={`memory-row-${m._id}`}
								style={{
									padding: "0.5rem 0.75rem",
									border: "1px solid #e5e7eb",
									borderRadius: "0.25rem",
									display: "flex",
									flexDirection: "column",
									gap: "0.375rem",
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: "0.5rem",
										fontSize: "0.75rem",
										color: "#666",
									}}
								>
									<span>
										{m.scope === "org" ? "org-wide" : "agent-scoped"}
										{m.alwaysOn ? " · always-on" : ""}
									</span>
									<div style={{ display: "flex", gap: "0.5rem" }}>
										<label
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "0.25rem",
												cursor: disabled || busy ? "not-allowed" : "pointer",
											}}
										>
											<input
												type="checkbox"
												data-testid={`memory-alwayson-${m._id}`}
												checked={m.alwaysOn}
												onChange={() => onToggleAlwaysOn(m._id, m.alwaysOn, m.content, m.scope)}
												disabled={disabled || busy}
											/>
											alwaysOn
										</label>
										<button
											type="button"
											onClick={() => onDelete(m._id)}
											disabled={disabled || busy}
											style={{
												padding: "0.125rem 0.375rem",
												background: "#fff",
												color: "#b00020",
												border: "1px solid #b00020",
												borderRadius: "0.25rem",
												cursor: disabled || busy ? "not-allowed" : "pointer",
												fontSize: "0.75rem",
											}}
										>
											Delete
										</button>
									</div>
								</div>
								<div style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>{m.content}</div>
							</li>
						);
					})}
				</ul>
			)}

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "0.5rem",
					padding: "0.75rem",
					border: "1px dashed #cbd5e1",
					borderRadius: "0.25rem",
				}}
			>
				<span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Add memory</span>
				<textarea
					data-testid="memory-new-content"
					value={draftContent}
					onChange={(e) => setDraftContent(e.target.value)}
					disabled={disabled || saving}
					rows={3}
					placeholder="e.g. Team ships on Fridays."
					style={{
						padding: "0.5rem",
						border: "1px solid #ccc",
						borderRadius: "0.25rem",
						fontSize: "0.875rem",
						resize: "vertical",
					}}
				/>
				<div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
					<label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
						<span style={{ fontSize: "0.75rem", color: "#555" }}>Scope</span>
						<select
							data-testid="memory-new-scope"
							value={draftScope}
							onChange={(e) => setDraftScope(e.target.value as Scope)}
							disabled={disabled || saving}
							style={{
								padding: "0.25rem",
								border: "1px solid #ccc",
								borderRadius: "0.25rem",
								fontSize: "0.75rem",
							}}
						>
							<option value="agent">this agent</option>
							<option value="org">whole org</option>
						</select>
					</label>
					<label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
						<input
							type="checkbox"
							data-testid="memory-new-alwayson"
							checked={draftAlwaysOn}
							onChange={(e) => setDraftAlwaysOn(e.target.checked)}
							disabled={disabled || saving}
						/>
						<span style={{ fontSize: "0.75rem", color: "#555" }}>alwaysOn</span>
					</label>
					<button
						type="button"
						onClick={onAdd}
						disabled={disabled || saving || !draftContent.trim()}
						data-testid="memory-new-save"
						style={{
							marginLeft: "auto",
							padding: "0.375rem 0.75rem",
							background: disabled || !draftContent.trim() ? "#d1d5db" : "#111",
							color: "white",
							border: "none",
							borderRadius: "0.25rem",
							cursor: disabled || !draftContent.trim() ? "not-allowed" : "pointer",
							fontSize: "0.875rem",
						}}
					>
						{saving ? "Adding…" : "Add memory"}
					</button>
				</div>
			</div>
		</div>
	);
}
