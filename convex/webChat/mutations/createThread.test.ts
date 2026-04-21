import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";

const baseAgent = {
	orgId: "org_A",
	slug: "default",
	name: "Default",
	systemPrompt: "You are mom.",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
};

describe("M1-T11 webChat.createThread", () => {
	it("requires authentication", async () => {
		const t = newTest();
		await expect(
			t.mutation(api.webChat.mutations.createThread.default, { orgId: "org_A" }),
		).rejects.toThrow(/Authentication required/);
	});

	it("creates a thread bound to the authenticated userId and the default agent", async () => {
		const t = newTest();
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const caller = t.withIdentity({ subject: userId });
		await caller.mutation(api.agents.mutations.createAgent.default, baseAgent);

		const threadId = await caller.mutation(api.webChat.mutations.createThread.default, {
			orgId: "org_A",
		});

		const thread = await t.run(async (ctx) => ctx.db.get(threadId));
		expect(thread?.binding).toMatchObject({ type: "web", userId });
	});

	it("is idempotent per (org, user)", async () => {
		const t = newTest();
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const caller = t.withIdentity({ subject: userId });
		await caller.mutation(api.agents.mutations.createAgent.default, baseAgent);

		const a = await caller.mutation(api.webChat.mutations.createThread.default, {
			orgId: "org_A",
		});
		const b = await caller.mutation(api.webChat.mutations.createThread.default, {
			orgId: "org_A",
		});
		expect(b).toBe(a);
	});

	it("accepts an explicit agentId arg when provided", async () => {
		const t = newTest();
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const caller = t.withIdentity({ subject: userId });
		const agentId = await caller.mutation(api.agents.mutations.createAgent.default, baseAgent);
		// Second agent, non-default
		const otherId = await caller.mutation(api.agents.mutations.createAgent.default, {
			...baseAgent,
			slug: "other",
			name: "Other",
		});

		const threadId = await caller.mutation(api.webChat.mutations.createThread.default, {
			orgId: "org_A",
			agentId: otherId,
		});

		const thread = await t.run(async (ctx) => ctx.db.get(threadId));
		expect(thread?.agentId).toBe(otherId);
		expect(thread?.agentId).not.toBe(agentId);
	});
});
