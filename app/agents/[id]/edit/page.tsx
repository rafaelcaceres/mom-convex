import type { Id } from "../../../../convex/_generated/dataModel";
import { SignOutButton } from "../../../SignOutButton";
import { AgentEditor } from "./AgentEditor";

type Params = { id: string };

export default async function AgentEditPage({ params }: { params: Promise<Params> }) {
	const { id } = await params;
	return (
		<main
			style={{
				display: "flex",
				flexDirection: "column",
				minHeight: "100vh",
				fontFamily: "system-ui, sans-serif",
			}}
		>
			<header
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "0.75rem 1.25rem",
					borderBottom: "1px solid #eee",
				}}
			>
				<h1 style={{ margin: 0, fontSize: "1.125rem" }}>Edit agent</h1>
				<SignOutButton />
			</header>
			<section style={{ padding: "1.5rem", maxWidth: "48rem" }}>
				<AgentEditor agentId={id as Id<"agents">} />
			</section>
		</main>
	);
}
