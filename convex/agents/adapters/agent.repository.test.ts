import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { NewAgent } from "../domain/agent.model";
import { AgentRepository } from "./agent.repository";

const baseAgent: NewAgent = {
	orgId: "org_A",
	slug: "default",
	name: "Default",
	systemPrompt: "You are mom.",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
	isDefault: true,
	toolsAllowlist: [],
};

describe("M1-T01 AgentRepository", () => {
	it("create inserts and returns aggregate model", async () => {
		const t = newTest();
		const created = await t.run(async (ctx) => {
			const agg = await AgentRepository.create(ctx, baseAgent);
			return agg.getModel();
		});
		expect(created.slug).toBe("default");
		expect(created.orgId).toBe("org_A");
		expect(created._id).toBeDefined();
	});

	it("byOrgSlug returns matching agent; miss returns null", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await AgentRepository.create(ctx, baseAgent);
		});

		const hit = await t.run(async (ctx) => {
			const agg = await AgentRepository.byOrgSlug(ctx, {
				orgId: "org_A",
				slug: "default",
			});
			return agg?.getModel() ?? null;
		});
		expect(hit?.slug).toBe("default");

		const miss = await t.run(async (ctx) => {
			const agg = await AgentRepository.byOrgSlug(ctx, {
				orgId: "org_A",
				slug: "does-not-exist",
			});
			return agg?.getModel() ?? null;
		});
		expect(miss).toBeNull();
	});

	it("byOrgSlug does not cross org boundaries", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await AgentRepository.create(ctx, { ...baseAgent, orgId: "org_A" });
			await AgentRepository.create(ctx, { ...baseAgent, orgId: "org_B" });
		});

		const wrongOrg = await t.run(async (ctx) => {
			const agg = await AgentRepository.byOrgSlug(ctx, {
				orgId: "org_B",
				slug: "default",
			});
			return agg?.getModel() ?? null;
		});
		expect(wrongOrg?.orgId).toBe("org_B");
	});

	it("listByOrg returns only agents of the given org", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await AgentRepository.create(ctx, { ...baseAgent, orgId: "org_A", slug: "a1" });
			await AgentRepository.create(ctx, {
				...baseAgent,
				orgId: "org_A",
				slug: "a2",
				isDefault: false,
			});
			await AgentRepository.create(ctx, { ...baseAgent, orgId: "org_B", slug: "b1" });
		});

		const rows = await t.run(async (ctx) => {
			const aggs = await AgentRepository.listByOrg(ctx, { orgId: "org_A" });
			return aggs.map((a) => a.getModel().slug).sort();
		});
		expect(rows).toEqual(["a1", "a2"]);
	});

	it("findDefault returns the default agent for the org", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await AgentRepository.create(ctx, { ...baseAgent, slug: "default", isDefault: true });
			await AgentRepository.create(ctx, { ...baseAgent, slug: "support", isDefault: false });
		});

		const found = await t.run(async (ctx) => {
			const agg = await AgentRepository.findDefault(ctx, { orgId: "org_A" });
			return agg?.getModel() ?? null;
		});
		expect(found?.slug).toBe("default");
		expect(found?.isDefault).toBe(true);
	});

	it("findDefault returns null when no default exists", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await AgentRepository.create(ctx, { ...baseAgent, isDefault: false });
		});

		const found = await t.run(async (ctx) => {
			const agg = await AgentRepository.findDefault(ctx, { orgId: "org_A" });
			return agg?.getModel() ?? null;
		});
		expect(found).toBeNull();
	});

	it("save persists aggregate mutations (replace semantics)", async () => {
		const t = newTest();
		const id = await t.run(async (ctx) => {
			const agg = await AgentRepository.create(ctx, baseAgent);
			return agg.getModel()._id;
		});

		await t.run(async (ctx) => {
			const agg = await AgentRepository.get(ctx, id);
			if (!agg) throw new Error("expected agent");
			agg.updateSystemPrompt("updated");
			agg.unmarkDefault();
			await AgentRepository.save(ctx, agg);
		});

		const reloaded = await t.run(async (ctx) => {
			const agg = await AgentRepository.get(ctx, id);
			return agg?.getModel() ?? null;
		});
		expect(reloaded?.systemPrompt).toBe("updated");
		expect(reloaded?.isDefault).toBe(false);
		// Untouched fields remain
		expect(reloaded?.modelId).toBe("claude-sonnet-4-5");
	});
});
