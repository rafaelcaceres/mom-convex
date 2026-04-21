"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

export function OnboardingForm() {
	const router = useRouter();
	const completeOnboarding = useMutation(api.tenancy.mutations.completeOnboarding.default);
	const myOrgs = useQuery(api.tenants.listOrganizations, {});
	const [orgName, setOrgName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (myOrgs && myOrgs.length > 0) {
			router.replace("/chat");
		}
	}, [myOrgs, router]);

	async function onSubmit(e: FormEvent) {
		e.preventDefault();
		const trimmed = orgName.trim();
		if (!trimmed || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			await completeOnboarding({ orgName: trimmed });
			router.push("/chat");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create workspace");
			setSubmitting(false);
		}
	}

	return (
		<form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
			<label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
				<span style={{ fontSize: "0.875rem", color: "#333" }}>Workspace name</span>
				<input
					type="text"
					value={orgName}
					onChange={(e) => setOrgName(e.target.value)}
					placeholder="Acme"
					disabled={submitting}
					style={{
						padding: "0.5rem",
						border: "1px solid #ccc",
						borderRadius: "0.25rem",
						fontSize: "1rem",
					}}
				/>
			</label>
			{error ? <p style={{ color: "#b00020", fontSize: "0.875rem" }}>{error}</p> : null}
			<button
				type="submit"
				disabled={submitting || !orgName.trim()}
				style={{
					padding: "0.5rem 1rem",
					background: "#111",
					color: "white",
					border: "none",
					borderRadius: "0.25rem",
					cursor: submitting ? "not-allowed" : "pointer",
					fontSize: "1rem",
				}}
			>
				{submitting ? "Creating…" : "Create workspace"}
			</button>
		</form>
	);
}
