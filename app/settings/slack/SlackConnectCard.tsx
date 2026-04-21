"use client";

import { useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Props = { orgId: string };

export function SlackConnectCard({ orgId }: Props) {
	const search = useSearchParams();
	const oauthStatus = search.get("status");

	const installs = useQuery(api.slack.queries.listInstallsByOrg.default, { orgId });
	const createInstallUrl = useMutation(api.slack.mutations.createInstallUrl.default);
	const uninstall = useMutation(api.slack.mutations.uninstall.default);

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (installs === undefined) return <p style={{ color: "#666" }}>Loading…</p>;

	async function onConnect() {
		setBusy(true);
		setError(null);
		try {
			const { url } = await createInstallUrl({ orgId });
			window.location.href = url;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to start install");
			setBusy(false);
		}
	}

	async function onDisconnect(installId: Id<"slackInstalls">) {
		if (!window.confirm("Disconnect this Slack workspace?")) return;
		setBusy(true);
		setError(null);
		try {
			await uninstall({ installId });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to disconnect");
		} finally {
			setBusy(false);
		}
	}

	const install = installs[0];

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
			<h2 style={{ margin: 0 }}>Slack</h2>
			{oauthStatus === "ok" ? <StatusBanner kind="ok" message="Slack connected." /> : null}
			{oauthStatus && oauthStatus !== "ok" ? (
				<StatusBanner kind="error" message={`Install failed: ${oauthStatus}`} />
			) : null}
			{error ? <StatusBanner kind="error" message={error} /> : null}

			{install ? (
				<div
					style={{
						border: "1px solid #e5e7eb",
						borderRadius: "0.5rem",
						padding: "1rem",
						display: "flex",
						flexDirection: "column",
						gap: "0.5rem",
					}}
				>
					<p style={{ margin: 0 }}>
						Connected to <strong>{install.teamName}</strong>
						<span style={{ color: "#888", fontSize: "0.875rem", marginLeft: "0.5rem" }}>
							({install.teamId})
						</span>
					</p>
					<p style={{ margin: 0, color: "#555", fontSize: "0.875rem" }}>
						Bot user: <code>{install.botUserId}</code>
					</p>
					<div>
						<button
							type="button"
							onClick={() => onDisconnect(install._id)}
							disabled={busy}
							style={{
								padding: "0.5rem 1rem",
								background: "#fff",
								color: "#b00020",
								border: "1px solid #b00020",
								borderRadius: "0.25rem",
								cursor: busy ? "not-allowed" : "pointer",
								fontSize: "0.875rem",
							}}
						>
							{busy ? "Disconnecting…" : "Disconnect"}
						</button>
					</div>
				</div>
			) : (
				<div
					style={{
						border: "1px dashed #cbd5e1",
						borderRadius: "0.5rem",
						padding: "1.25rem",
						display: "flex",
						flexDirection: "column",
						gap: "0.75rem",
					}}
				>
					<p style={{ margin: 0, color: "#444" }}>
						Connect a Slack workspace so this agent can reply to @mentions and DMs.
					</p>
					<div>
						<button
							type="button"
							onClick={onConnect}
							disabled={busy}
							style={{
								padding: "0.5rem 1rem",
								background: "#611f69",
								color: "white",
								border: "none",
								borderRadius: "0.25rem",
								cursor: busy ? "not-allowed" : "pointer",
								fontSize: "1rem",
							}}
						>
							{busy ? "Redirecting…" : "Connect to Slack"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function StatusBanner({ kind, message }: { kind: "ok" | "error"; message: string }) {
	const color = kind === "ok" ? "#065f46" : "#b00020";
	const bg = kind === "ok" ? "#ecfdf5" : "#fef2f2";
	return (
		<div
			style={{
				background: bg,
				color,
				border: `1px solid ${color}`,
				borderRadius: "0.25rem",
				padding: "0.5rem 0.75rem",
				fontSize: "0.875rem",
			}}
		>
			{message}
		</div>
	);
}
