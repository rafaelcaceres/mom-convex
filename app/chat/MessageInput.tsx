"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Props = { threadId: Id<"threads"> };

export function MessageInput({ threadId }: Props) {
	const sendMessage = useMutation(api.webChat.mutations.sendMessage.default);
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		const trimmed = text.trim();
		if (!trimmed || sending) return;
		setSending(true);
		try {
			await sendMessage({ threadId, text: trimmed });
			setText("");
		} finally {
			setSending(false);
		}
	}

	return (
		<form
			onSubmit={onSubmit}
			style={{
				display: "flex",
				gap: "0.5rem",
				padding: "0.75rem 1.25rem",
				borderTop: "1px solid #eee",
			}}
		>
			<input
				type="text"
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder="Message…"
				disabled={sending}
				style={{
					flex: 1,
					padding: "0.5rem 0.75rem",
					border: "1px solid #ccc",
					borderRadius: "0.375rem",
					fontSize: "0.875rem",
				}}
			/>
			<button
				type="submit"
				disabled={sending || !text.trim()}
				style={{
					padding: "0.5rem 1rem",
					background: "#111",
					color: "white",
					border: "none",
					borderRadius: "0.375rem",
					cursor: sending || !text.trim() ? "not-allowed" : "pointer",
					fontSize: "0.875rem",
				}}
			>
				{sending ? "Sending…" : "Send"}
			</button>
		</form>
	);
}
