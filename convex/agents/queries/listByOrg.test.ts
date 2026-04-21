import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";

const baseArgs = {
	orgId: "org_A",
	slug: "default",
	name: "Default",
	systemPrompt: "You are mom.",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
};

describe("M1-T01 listByOrg query", () => {
	it("rejects unauthenticated callers", async () => {
		const t = newTest();
		await expect(t.query(api.agents.queries.listByOrg.default, { orgId: "org_A" })).rejects.toThrow(
			/authentication required/i,
		);
	});

	it("returns only agents in the requested org", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		await caller.mutation(api.agents.mutations.createAgent.default, {
			...baseArgs,
			slug: "support",
			name: "Support",
		});
		await caller.mutation(api.agents.mutations.createAgent.default, {
			...baseArgs,
			orgId: "org_B",
			slug: "default",
		});

		const rows = await caller.query(api.agents.queries.listByOrg.default, {
			orgId: "org_A",
		});
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.slug).sort()).toEqual(["default", "support"]);
		expect(rows.every((r) => r.orgId === "org_A")).toBe(true);
	});

	it("returns empty array when org has no agents", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		const rows = await caller.query(api.agents.queries.listByOrg.default, {
			orgId: "org_none",
		});
		expect(rows).toEqual([]);
	});
});
