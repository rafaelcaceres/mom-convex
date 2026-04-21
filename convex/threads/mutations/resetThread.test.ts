import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const baseAgentArgs = {
	orgId: "org_A",
	slug: "default",
	name: "Default",
	systemPrompt: "You are mom.",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
};

async function seedAgent(t: ReturnType<typeof newTest>): Promise<Id<"agents">> {
	return t
		.withIdentity({ subject: "user_1" })
		.mutation(api.agents.mutations.createAgent.default, baseAgentArgs);
}

async function seedSlackThread(
	t: ReturnType<typeof newTest>,
	agentId: Id<"agents">,
): Promise<Id<"threads">> {
	return t.mutation(internal.threads.mutations.ensureThread.default, {
		orgId: "org_A",
		agentId,
		binding: {
			type: "slack",
			installId: "si_1",
			channelId: "C1",
			threadTs: "1.1",
		},
	});
}

describe("threads.resetThread", () => {
	it("swaps agentThreadId and preserves the wrapper threadId + binding", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const threadId = await seedSlackThread(t, agentId);

		const before = await t.run(async (ctx) => ctx.db.get(threadId));
		expect(before).not.toBeNull();
		const previousAgentThreadId = before?.agentThreadId;
		const previousBindingKey = before?.bindingKey;

		const result = await t.mutation(internal.threads.mutations.resetThread.default, {
			threadId,
		});

		expect(result.threadId).toBe(threadId);
		expect(result.previousAgentThreadId).toBe(previousAgentThreadId);
		expect(result.agentThreadId).not.toBe(previousAgentThreadId);

		const after = await t.run(async (ctx) => ctx.db.get(threadId));
		expect(after?.agentThreadId).toBe(result.agentThreadId);
		// Binding/key untouched so Slack inbound still resolves to this row.
		expect(after?.bindingKey).toBe(previousBindingKey);
	});

	it("throws when the thread doesn't exist", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const threadId = await seedSlackThread(t, agentId);
		await t.run(async (ctx) => ctx.db.delete(threadId));

		await expect(
			t.mutation(internal.threads.mutations.resetThread.default, { threadId }),
		).rejects.toThrow(/not found/i);
	});

	it("next ensureThread on the same binding returns the reset thread (same id, new agentThreadId)", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const threadId = await seedSlackThread(t, agentId);

		const { agentThreadId: resetAgentThreadId } = await t.mutation(
			internal.threads.mutations.resetThread.default,
			{ threadId },
		);

		const resolvedAgain = await seedSlackThread(t, agentId);
		expect(resolvedAgain).toBe(threadId);

		const doc = await t.run(async (ctx) => ctx.db.get(threadId));
		expect(doc?.agentThreadId).toBe(resetAgentThreadId);
	});
});
