import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import type { NewAgent } from "../../agents/domain/agent.model";

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

async function seedAgent(t: ReturnType<typeof newTest>): Promise<Id<"agents">> {
	return t.run(async (ctx) => {
		const agg = await AgentRepository.create(ctx, baseAgent);
		return agg.getModel()._id;
	});
}

describe("F-03 setThreadParentTs mutation", () => {
	it("persists parentTs on a slack-bound thread", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const threadId = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding: { type: "slack", installId: "si_1", channelId: "C1", threadTs: "1.1" },
		});

		await t.mutation(internal.threads.mutations.setThreadParentTs.default, {
			threadId,
			ts: "999.0",
		});

		const got = await t.run(async (ctx) => ctx.db.get(threadId));
		expect(got?.binding.type).toBe("slack");
		if (got?.binding.type === "slack") {
			expect(got.binding.parentTs).toBe("999.0");
			expect(got.binding.threadTs).toBe("1.1");
		}
	});

	it("rejects when the thread is non-slack (web)", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const threadId = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding: { type: "web", userId },
		});

		await expect(
			t.mutation(internal.threads.mutations.setThreadParentTs.default, {
				threadId,
				ts: "999.0",
			}),
		).rejects.toThrow(/slack/);
	});
});
