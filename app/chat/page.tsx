import { SignOutButton } from "../SignOutButton";
import { ChatShell } from "./ChatShell";

export default function ChatPage() {
	return (
		<main
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100vh",
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
				<h1 style={{ margin: 0, fontSize: "1.125rem" }}>Chat</h1>
				<SignOutButton />
			</header>
			<ChatShell />
		</main>
	);
}
