"use client";

import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Props = { threadId: Id<"threads"> };

export function MessageList({ threadId }: Props) {
	const messages = useQuery(api.webChat.queries.listMessages.default, { threadId });
	const bottomRef = useRef<HTMLDivElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages?.length]);

	return (
		<div
			style={{
				flex: 1,
				overflowY: "auto",
				padding: "1rem 1.25rem",
				display: "flex",
				flexDirection: "column",
				gap: "0.5rem",
			}}
		>
			{messages === undefined ? (
				<p style={{ color: "#888" }}>Loading messages…</p>
			) : messages.length === 0 ? (
				<p style={{ color: "#888" }}>No messages yet. Say hi.</p>
			) : (
				messages.map((m) => {
					const fromUser = m.role === "user";
					return (
						<div
							key={m.messageId}
							style={{
								alignSelf: fromUser ? "flex-end" : "flex-start",
								maxWidth: "75%",
								background: fromUser ? "#111" : "#f3f4f6",
								color: fromUser ? "white" : "#111",
								padding: "0.5rem 0.75rem",
								borderRadius: "0.75rem",
								fontSize: "0.875rem",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
							}}
						>
							{m.text}
						</div>
					);
				})
			)}
			<div ref={bottomRef} />
		</div>
	);
}
