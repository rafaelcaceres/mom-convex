"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { ThreadList } from "./ThreadList";
import { UsagePanel } from "./UsagePanel";

export function ChatShell() {
	const router = useRouter();
	const orgs = useQuery(api.tenants.listOrganizations, {});
	const orgId = orgs?.[0]?._id;

	const threads = useQuery(api.webChat.queries.myThreads.default, orgId ? { orgId } : "skip");
	const createThread = useMutation(api.webChat.mutations.createThread.default);

	const [activeThreadId, setActiveThreadId] = useState<Id<"threads"> | null>(null);
	const [seeding, setSeeding] = useState(false);

	useEffect(() => {
		if (orgs && orgs.length === 0) router.replace("/onboarding");
	}, [orgs, router]);

	// First-visit seed: if the user has no web thread yet, create one so the
	// echo loop has something to target. Idempotent on the server side.
	useEffect(() => {
		if (!orgId || !threads || seeding) return;
		if (threads.length === 0) {
			setSeeding(true);
			createThread({ orgId })
				.then((id) => setActiveThreadId(id))
				.finally(() => setSeeding(false));
		}
	}, [orgId, threads, createThread, seeding]);

	useEffect(() => {
		if (!threads || threads.length === 0) return;
		if (activeThreadId && threads.some((t) => t._id === activeThreadId)) return;
		const first = threads[0];
		if (first) setActiveThreadId(first._id);
	}, [threads, activeThreadId]);

	if (orgs === undefined || threads === undefined) {
		return <div style={{ padding: "1.25rem", color: "#666" }}>Loading…</div>;
	}

	return (
		<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
			<ThreadList threads={threads} activeThreadId={activeThreadId} onSelect={setActiveThreadId} />
			<section
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					minWidth: 0,
				}}
			>
				{activeThreadId ? (
					<>
						<UsagePanel threadId={activeThreadId} />
						<MessageList threadId={activeThreadId} />
						<MessageInput threadId={activeThreadId} />
					</>
				) : (
					<div style={{ padding: "1.25rem", color: "#666" }}>
						{seeding ? "Creating your first thread…" : "No thread selected."}
					</div>
				)}
			</section>
		</div>
	);
}
