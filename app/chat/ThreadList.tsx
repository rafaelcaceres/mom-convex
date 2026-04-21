"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Thread = FunctionReturnType<typeof api.webChat.queries.myThreads.default>[number];

type Props = {
	threads: Thread[];
	activeThreadId: Id<"threads"> | null;
	onSelect: (id: Id<"threads">) => void;
};

export function ThreadList({ threads, activeThreadId, onSelect }: Props) {
	return (
		<aside
			style={{
				width: "16rem",
				borderRight: "1px solid #eee",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				style={{
					padding: "0.75rem",
					borderBottom: "1px solid #eee",
					fontSize: "0.75rem",
					color: "#666",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
				}}
			>
				Your threads
			</div>
			<ul
				style={{
					listStyle: "none",
					padding: 0,
					margin: 0,
					overflowY: "auto",
					flex: 1,
				}}
			>
				{threads.length === 0 ? (
					<li style={{ padding: "0.75rem", color: "#777", fontSize: "0.875rem" }}>
						No threads yet.
					</li>
				) : (
					threads.map((t) => {
						const active = t._id === activeThreadId;
						return (
							<li key={t._id}>
								<button
									type="button"
									onClick={() => onSelect(t._id)}
									style={{
										display: "block",
										width: "100%",
										textAlign: "left",
										padding: "0.5rem 0.75rem",
										background: active ? "#f3f4f6" : "transparent",
										border: "none",
										borderBottom: "1px solid #f5f5f5",
										cursor: "pointer",
										fontSize: "0.875rem",
										color: "#111",
									}}
								>
									Thread {t._id.slice(-6)}
									<div style={{ fontSize: "0.75rem", color: "#888" }}>
										{new Date(t._creationTime).toLocaleString()}
									</div>
								</button>
							</li>
						);
					})
				)}
			</ul>
		</aside>
	);
}
