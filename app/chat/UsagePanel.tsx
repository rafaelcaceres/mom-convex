"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { UsageBadge } from "./UsageBadge";

type Props = { threadId: Id<"threads"> };

/**
 * Collapsible header above the message list — folded by default so the chat
 * stays uncluttered. Hosts the `UsageBadge` (cost + token + per-tool
 * breakdown) reactive to the active thread.
 */
export function UsagePanel({ threadId }: Props) {
	const cost = useQuery(api.cost.queries.byThread.default, { threadId });

	return (
		<details
			data-testid="usage-panel"
			style={{
				margin: "0.5rem 1rem 0",
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
					color: "#374151",
				}}
			>
				<span style={{ fontWeight: 600 }}>Usage & cost</span>
				{cost ? (
					<span style={{ marginLeft: "auto", color: "#6b7280", fontSize: "0.75rem" }}>
						{cost.sum.count} {cost.sum.count === 1 ? "step" : "steps"} ·{" "}
						{cost.sum.costUsd === 0
							? "$0.0000"
							: cost.sum.costUsd < 0.0001
								? "<$0.0001"
								: `$${cost.sum.costUsd.toFixed(4)}`}
					</span>
				) : null}
			</summary>
			<div style={{ padding: "0 0.75rem 0.75rem" }}>
				<UsageBadge cost={cost} />
			</div>
		</details>
	);
}
