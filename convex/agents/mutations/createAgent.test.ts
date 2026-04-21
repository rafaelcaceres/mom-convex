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

describe("M1-T01 createAgent mutation", () => {
	it("rejects unauthenticated callers", async () => {
		const t = newTest();
		await expect(t.mutation(api.agents.mutations.createAgent.default, baseArgs)).rejects.toThrow(
			/authentication required/i,
		);
	});

	it("creates an agent when authenticated", async () => {
		const t = newTest();
		const id = await t
			.withIdentity({ subject: "user_1" })
			.mutation(api.agents.mutations.createAgent.default, baseArgs);
		expect(id).toBeTypeOf("string");

		const agent = await t.run(async (ctx) => ctx.db.get(id));
		expect(agent?.slug).toBe("default");
		expect(agent?.orgId).toBe("org_A");
		expect(agent?.toolsAllowlist).toEqual([]);
		// First agent in an org is the default automatically.
		expect(agent?.isDefault).toBe(true);
	});

	it("second agent in the same org is NOT default", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		const secondId = await caller.mutation(api.agents.mutations.createAgent.default, {
			...baseArgs,
			slug: "support",
			name: "Support",
		});
		const second = await t.run(async (ctx) => ctx.db.get(secondId));
		expect(second?.isDefault).toBe(false);
	});

	it("rejects duplicate slug within the same org", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		await expect(
			caller.mutation(api.agents.mutations.createAgent.default, baseArgs),
		).rejects.toThrow(/slug/i);
	});

	it("allows same slug across different orgs", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		const otherOrgId = await caller.mutation(api.agents.mutations.createAgent.default, {
			...baseArgs,
			orgId: "org_B",
		});
		expect(otherOrgId).toBeTypeOf("string");
	});
});
