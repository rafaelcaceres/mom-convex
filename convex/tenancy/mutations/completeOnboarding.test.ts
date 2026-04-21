import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";

describe("M1-T12 completeOnboarding", () => {
	it("requires authentication", async () => {
		const t = newTest();
		await expect(
			t.mutation(api.tenancy.mutations.completeOnboarding.default, { orgName: "Acme" }),
		).rejects.toThrow(/Authentication required/);
	});

	it("creates org, adds caller as owner member, and seeds a default agent", async () => {
		const t = newTest();
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const caller = t.withIdentity({ subject: userId });

		const { orgId, created } = await caller.mutation(
			api.tenancy.mutations.completeOnboarding.default,
			{ orgName: "Acme" },
		);
		expect(created).toBe(true);

		// Agent seeded with isDefault
		const agents = await caller.query(api.agents.queries.listByOrg.default, { orgId });
		expect(agents).toHaveLength(1);
		expect(agents[0]).toMatchObject({ slug: "default", isDefault: true });

		// Caller is owner — listOrganizations returns the org with ownerId === userId.
		const orgs = await caller.query(api.tenants.listOrganizations, {});
		expect(orgs).toHaveLength(1);
		expect(orgs[0]?._id).toBe(orgId);
	});

	it("is idempotent — second call returns same org without duplicating agents", async () => {
		const t = newTest();
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const caller = t.withIdentity({ subject: userId });

		const first = await caller.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme",
		});
		const second = await caller.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme-rename",
		});
		expect(second.orgId).toBe(first.orgId);
		expect(second.created).toBe(false);

		const agents = await caller.query(api.agents.queries.listByOrg.default, {
			orgId: first.orgId,
		});
		expect(agents).toHaveLength(1);
	});

	it("rejects empty org name", async () => {
		const t = newTest();
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const caller = t.withIdentity({ subject: userId });
		await expect(
			caller.mutation(api.tenancy.mutations.completeOnboarding.default, { orgName: "   " }),
		).rejects.toThrow(/Organization name is required/);
	});
});
