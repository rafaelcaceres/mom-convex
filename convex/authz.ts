import { Authz, definePermissions, defineRoles } from "@djpanda/convex-authz";
import { TENANTS_PERMISSIONS, TENANTS_ROLES } from "@djpanda/convex-tenants";
import { components } from "./_generated/api";

/**
 * Authorization policy for mom-convex.
 *
 * Built on `@djpanda/convex-authz` (RBAC). Starts with tenant-level defaults
 * (organizations, members, teams, invitations) from `@djpanda/convex-tenants`.
 * Domain-specific permissions (agents, threads, memories, skills) will be
 * appended here as each M1+ milestone lands.
 */
const permissions = definePermissions(TENANTS_PERMISSIONS, {
	// M1+ will append: agents, threads, memory, etc.
});

const roles = defineRoles(permissions, TENANTS_ROLES, {
	// owner/admin/member inherited from TENANTS_ROLES.
});

export const authz = new Authz(components.authz, { permissions, roles });
