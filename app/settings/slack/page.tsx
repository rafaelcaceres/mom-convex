import { SignOutButton } from "../../SignOutButton";
import { SlackSettings } from "./SlackSettings";

export default function SlackSettingsPage() {
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
				<h1 style={{ margin: 0, fontSize: "1.125rem" }}>Settings · Slack</h1>
				<SignOutButton />
			</header>
			<section style={{ padding: "1.5rem", maxWidth: "40rem" }}>
				<SlackSettings />
			</section>
		</main>
	);
}
