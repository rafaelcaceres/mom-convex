import { getAuthUserId } from "@convex-dev/auth/server";
import { Tenants, makeTenantsAPI } from "@djpanda/convex-tenants";
import { components } from "./_generated/api";
import { authz } from "./authz";

/**
 * Direct Tenants-class instance for internal code that needs to call
 * `createOrganization`/`listOrganizations` etc. without the double-hop of
 * invoking the exported public mutation. Used by `completeOnboarding`
 * (M1-T12) so the one-shot signup flow stays in a single transaction.
 */
export const tenants = new Tenants(components.tenants, {
	authz,
	creatorRole: "owner",
});

/**
 * Tenancy surface exposed to the app (queries/mutations for orgs, members,
 * teams, invites). Produced by `makeTenantsAPI` — see task M0-T05 and
 * @djpanda/convex-tenants docs for every exported function.
 *
 * Auth is resolved via `getAuthUserId` from `@convex-dev/auth/server`,
 * which returns the Convex user `_id` (or null when anonymous).
 */
export const {
	// Organizations
	createOrganization,
	updateOrganization,
	deleteOrganization,
	getOrganization,
	listOrganizations,
	transferOwnership,
	// Members
	addMember,
	removeMember,
	updateMemberRole,
	getMember,
	listMembers,
	// Teams
	createTeam,
	updateTeam,
	deleteTeam,
	addTeamMember,
	removeTeamMember,
	listTeams,
	listTeamMembers,
	// Invitations
	inviteMember,
	acceptInvitation,
	cancelInvitation,
	resendInvitation,
	listInvitations,
	getInvitation,
	// Authorization
	checkPermission,
	checkMemberPermission,
	getUserPermissions,
	getUserRoles,
} = makeTenantsAPI(components.tenants, {
	authz,
	creatorRole: "owner",
	auth: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		return userId ?? null;
	},
});
