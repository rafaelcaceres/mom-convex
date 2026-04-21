import { getAuthUserId } from "@convex-dev/auth/server";
import type { UserIdentity } from "convex/server";
import type { QueryCtx } from "./_generated/server";
import { tenants } from "./tenants";

/**
 * Shared guards for user-facing queries/mutations. Most domain code should
 * call `requireIdentity(ctx)` at the top of its handler — the thrown error is
 * surfaced cleanly to the client.
 */
export async function requireIdentity(ctx: Pick<QueryCtx, "auth">): Promise<UserIdentity> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error("Authentication required");
	}
	return identity;
}

export function userSubjectFromIdentity(identity: UserIdentity): string {
	return identity.subject;
}

export type OrgRole = "owner" | "admin" | "member";

/**
 * Membership + role guard. Resolves the Convex user id via `getAuthUserId`
 * and asks `@djpanda/convex-tenants` whether that user satisfies `minRole`
 * in `orgId`. Throws "Authentication required" if no session and
 * "Forbidden" if the user isn't a member, or their role is below `minRole`.
 *
 * `minRole` follows the standard hierarchy: `owner` ≥ `admin` ≥ `member`.
 */
export async function requireOrgRole(
	ctx: QueryCtx,
	orgId: string,
	minRole: OrgRole,
): Promise<{ userId: string; role: OrgRole }> {
	await requireIdentity(ctx);
	const userId = await getAuthUserId(ctx);
	if (!userId) throw new Error("Authentication required");

	const { hasPermission, currentRole } = await tenants.checkMemberPermission(
		ctx,
		orgId,
		userId,
		minRole,
	);
	if (!hasPermission || !currentRole) {
		throw new Error("Forbidden");
	}
	return { userId, role: currentRole };
}
