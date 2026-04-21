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

describe("M1-T01 setDefault mutation", () => {
	it("requires auth", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		const agentId = await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		await expect(t.mutation(api.agents.mutations.setDefault.default, { agentId })).rejects.toThrow(
			/authentication required/i,
		);
	});

	it("promotes a non-default agent and demotes the previous one", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		const firstId = await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		const secondId = await caller.mutation(api.agents.mutations.createAgent.default, {
			...baseArgs,
			slug: "support",
			name: "Support",
		});

		await caller.mutation(api.agents.mutations.setDefault.default, { agentId: secondId });

		const [first, second] = await t.run(async (ctx) => [
			await ctx.db.get(firstId),
			await ctx.db.get(secondId),
		]);
		expect(first?.isDefault).toBe(false);
		expect(second?.isDefault).toBe(true);
	});

	it("is idempotent on an already-default agent", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		const id = await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		await caller.mutation(api.agents.mutations.setDefault.default, { agentId: id });
		const agent = await t.run(async (ctx) => ctx.db.get(id));
		expect(agent?.isDefault).toBe(true);
	});

	it("throws on unknown agentId", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		// Create+delete to get a non-existent id of the right shape
		const id = await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		await t.run(async (ctx) => {
			await ctx.db.delete(id);
		});
		await expect(
			caller.mutation(api.agents.mutations.setDefault.default, { agentId: id }),
		).rejects.toThrow(/not found/i);
	});
});
