import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { seedSkillCatalog } from "../_seeds";

async function setupAgent(t: ReturnType<typeof newTest>) {
	const ownerUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: ownerUserId });
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: "Acme",
	});
	const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;
	await t.run(async (ctx) => {
		await seedSkillCatalog(ctx);
	});
	return { owner, ownerUserId, orgId, agentId };
}

describe("M2-T03 toggleSkill mutation", () => {
	it("rejects unauthenticated callers", async () => {
		const t = newTest();
		const { agentId } = await setupAgent(t);
		await expect(
			t.mutation(api.skills.mutations.toggleSkill.default, {
				agentId,
				skillKey: "http.fetch",
				action: "disable",
			}),
		).rejects.toThrow(/authentication required/i);
	});

	it("rejects callers without admin role in the agent's org", async () => {
		const t = newTest();
		const { agentId } = await setupAgent(t);

		const outsiderId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const outsider = t.withIdentity({ subject: outsiderId });
		await expect(
			outsider.mutation(api.skills.mutations.toggleSkill.default, {
				agentId,
				skillKey: "http.fetch",
				action: "disable",
			}),
		).rejects.toThrow(/forbidden/i);
	});

	it("throws when skill key is not in the catalog", async () => {
		const t = newTest();
		const { owner, agentId } = await setupAgent(t);
		await expect(
			owner.mutation(api.skills.mutations.toggleSkill.default, {
				agentId,
				skillKey: "does.not.exist",
				action: "enable",
			}),
		).rejects.toThrow(/unknown skill/i);
	});

	it("throws when the catalog entry is disabled", async () => {
		const t = newTest();
		const { owner, agentId } = await setupAgent(t);

		// Flip a catalog row to disabled after seed.
		await t.run(async (ctx) => {
			const row = await ctx.db
				.query("skillCatalog")
				.withIndex("by_key", (q) => q.eq("key", "http.fetch"))
				.unique();
			if (!row) throw new Error("expected http.fetch in catalog");
			await ctx.db.patch(row._id, { enabled: false });
		});

		await expect(
			owner.mutation(api.skills.mutations.toggleSkill.default, {
				agentId,
				skillKey: "http.fetch",
				action: "enable",
			}),
		).rejects.toThrow(/disabled in catalog/i);
	});

	it("admin enables then disables a skill for the agent (happy path)", async () => {
		const t = newTest();
		const { owner, agentId } = await setupAgent(t);

		await owner.mutation(api.skills.mutations.toggleSkill.default, {
			agentId,
			skillKey: "sandbox.bash",
			action: "enable",
		});
		const afterEnable = await owner.query(api.skills.queries.listForAgent.default, { agentId });
		const keysEnabled = afterEnable.map((r) => r.skillKey).sort();
		expect(keysEnabled).toContain("sandbox.bash");

		await owner.mutation(api.skills.mutations.toggleSkill.default, {
			agentId,
			skillKey: "sandbox.bash",
			action: "disable",
		});
		const afterDisable = await owner.query(api.skills.queries.listForAgent.default, { agentId });
		expect(afterDisable.map((r) => r.skillKey)).not.toContain("sandbox.bash");
	});

	it("agent creation seeds baseline skills (http.fetch, memory.search) via trigger", async () => {
		const t = newTest();
		// Seed catalog BEFORE org/agent creation so trigger sees the entries.
		await t.run(async (ctx) => {
			await seedSkillCatalog(ctx);
		});

		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const caller = t.withIdentity({ subject: userId });
		const { orgId } = await caller.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme",
		});
		const agents = await caller.query(api.agents.queries.listByOrg.default, { orgId });
		const agentId = agents[0]?._id as Id<"agents">;

		const listed = await caller.query(api.skills.queries.listForAgent.default, { agentId });
		const baseline = listed.map((r) => r.skillKey).sort();
		expect(baseline).toEqual(["http.fetch", "memory.search"]);
	});
});
