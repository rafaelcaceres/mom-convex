"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import { SlackConnectCard } from "./SlackConnectCard";

export function SlackSettings() {
	const router = useRouter();
	const orgs = useQuery(api.tenants.listOrganizations, {});
	const orgId = orgs?.[0]?._id;

	useEffect(() => {
		if (orgs && orgs.length === 0) router.replace("/onboarding");
	}, [orgs, router]);

	const roles = useQuery(api.tenants.getUserRoles, orgId ? { organizationId: orgId } : "skip") as
		| Array<{ role: string }>
		| undefined;

	if (orgs === undefined || (orgId && roles === undefined)) {
		return <p style={{ color: "#666" }}>Loading…</p>;
	}

	if (!orgId) return null;

	const isOwner = Array.isArray(roles) && roles.some((r) => r.role === "owner");
	if (!isOwner) {
		return (
			<div>
				<h2 style={{ marginTop: 0 }}>Access denied</h2>
				<p style={{ color: "#555" }}>
					Only workspace owners can manage the Slack integration. Ask an owner to connect Slack.
				</p>
			</div>
		);
	}

	return <SlackConnectCard orgId={orgId} />;
}
