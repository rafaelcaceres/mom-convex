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

describe("M1-T01 updateSystemPrompt mutation", () => {
	it("requires auth", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		const id = await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		await expect(
			t.mutation(api.agents.mutations.updateSystemPrompt.default, {
				agentId: id,
				systemPrompt: "new",
			}),
		).rejects.toThrow(/authentication required/i);
	});

	it("updates the prompt", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		const id = await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		await caller.mutation(api.agents.mutations.updateSystemPrompt.default, {
			agentId: id,
			systemPrompt: "New prompt here.",
		});
		const agent = await t.run(async (ctx) => ctx.db.get(id));
		expect(agent?.systemPrompt).toBe("New prompt here.");
	});

	it("rejects empty prompt", async () => {
		const t = newTest();
		const caller = t.withIdentity({ subject: "user_1" });
		const id = await caller.mutation(api.agents.mutations.createAgent.default, baseArgs);
		await expect(
			caller.mutation(api.agents.mutations.updateSystemPrompt.default, {
				agentId: id,
				systemPrompt: "   ",
			}),
		).rejects.toThrow(/empty/i);
	});
});
