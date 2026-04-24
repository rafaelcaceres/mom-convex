"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";

/**
 * Header shortcut from /chat to /agents/[id]/edit for the org's default agent.
 * Hidden until orgs + default agent resolve — we don't want a dead link to flash.
 */
export function ConfigureAgentLink() {
	const orgs = useQuery(api.tenants.listOrganizations, {});
	const orgId = orgs?.[0]?._id;
	const agent = useQuery(api.agents.queries.getDefault.default, orgId ? { orgId } : "skip");

	if (!agent) return null;

	return (
		<Link
			href={`/agents/${agent._id}/edit`}
			style={{
				padding: "0.375rem 0.75rem",
				background: "#fff",
				color: "#111",
				border: "1px solid #d1d5db",
				borderRadius: "0.25rem",
				fontSize: "0.875rem",
				textDecoration: "none",
			}}
		>
			Configure agent
		</Link>
	);
}
