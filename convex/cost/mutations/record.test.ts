import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

async function seedAgentAndThread(t: ReturnType<typeof newTest>) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {});
		const agentId = await ctx.db.insert("agents", {
			orgId: "org_A",
			slug: "a",
			name: "A",
			systemPrompt: "sp",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
			isDefault: true,
			toolsAllowlist: [],
		});
		const threadId = await ctx.db.insert("threads", {
			orgId: "org_A",
			agentId,
			agentThreadId: "pending:1",
			bindingKey: "web:u1",
			binding: { type: "web", userId },
		});
		return { agentId, threadId };
	});
}

describe("M2-T15 cost.record mutation", () => {
	it("persists a row with all fields and returns its id", async () => {
		const t = newTest();
		const { agentId, threadId } = await seedAgentAndThread(t);

		const id = await t.mutation(internal.cost.mutations.record.default, {
			orgId: "org_A",
			agentId: agentId as Id<"agents">,
			threadId: threadId as Id<"threads">,
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			tokensIn: 100,
			tokensOut: 50,
			cacheRead: 10,
			cacheWrite: 5,
			costUsd: 0.0042,
			createdAt: 1_700_000_000,
			stepType: "text-generation",
		});

		const doc = await t.run(async (ctx) => ctx.db.get(id));
		expect(doc).toMatchObject({
			orgId: "org_A",
			agentId,
			threadId,
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			tokensIn: 100,
			tokensOut: 50,
			cacheRead: 10,
			cacheWrite: 5,
			costUsd: 0.0042,
			createdAt: 1_700_000_000,
			stepType: "text-generation",
		});
		expect(doc?.toolName).toBeUndefined();
	});

	it("persists a tool-call row with toolName populated", async () => {
		const t = newTest();
		const { agentId, threadId } = await seedAgentAndThread(t);

		const id = await t.mutation(internal.cost.mutations.record.default, {
			orgId: "org_A",
			agentId: agentId as Id<"agents">,
			threadId: threadId as Id<"threads">,
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			tokensIn: 0,
			tokensOut: 0,
			cacheRead: 0,
			cacheWrite: 0,
			costUsd: 0,
			createdAt: 1_700_000_000,
			stepType: "tool-call",
			toolName: "http.fetch",
		});

		const doc = await t.run(async (ctx) => ctx.db.get(id));
		expect(doc).toMatchObject({
			stepType: "tool-call",
			toolName: "http.fetch",
			costUsd: 0,
		});
	});
});
