import { describe, expect, it } from "vitest";
import { newTest } from "../test/_helpers/convex";
import { api } from "./_generated/api";
import * as tenantsModule from "./tenants";

/**
 * Smoke tests for the tenants surface.
 *
 * Full end-to-end tests (user A creates org, user B can't see it, role
 * enforcement, etc.) come in M1-T01 onwards when real domain mutations call
 * `checkPermission` + `getUserRoles`. This file just verifies the module
 * wiring works and the component tables are composed correctly into our schema.
 */
describe("M0-T05 tenants wiring", () => {
	it("exports expected tenant mutations/queries", () => {
		// Spot-check a few critical exports from `makeTenantsAPI`.
		const expected = [
			"createOrganization",
			"listOrganizations",
			"addMember",
			"listMembers",
			"inviteMember",
			"acceptInvitation",
			"checkPermission",
			"getUserPermissions",
			"getUserRoles",
		] as const;
		for (const name of expected) {
			expect(tenantsModule).toHaveProperty(name);
		}
	});

	it("tenancy components initialise without throwing", async () => {
		const t = newTest();
		// Instantiating convexTest with the schema already loads the component
		// tree; doing a trivial run here confirms no boot-time errors.
		const ok = await t.run(async () => true);
		expect(ok).toBe(true);
	});

	it("auth-protected caller resolves getAuthUserId to a null identity (anon)", async () => {
		// A fresh ctx without `withIdentity` has no user. `listOrganizations`
		// internally calls our `auth` resolver; unauthenticated requests throw.
		const t = newTest();
		await expect(t.query(api.tenants.listOrganizations, {})).rejects.toThrow();
	});
});
