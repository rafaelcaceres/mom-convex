import { OnboardingForm } from "./OnboardingForm";

export default function OnboardingPage() {
	return (
		<main style={{ padding: "2rem", maxWidth: "32rem", fontFamily: "system-ui, sans-serif" }}>
			<h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Welcome to mom</h1>
			<p style={{ marginBottom: "1.5rem", color: "#555" }}>
				Name your workspace. You'll land on a chat with a default agent — edit prompts, add skills
				and Slack later.
			</p>
			<OnboardingForm />
		</main>
	);
}
