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

describe("M1-T02 ensureThread", () => {
	it("creates a thread on first call", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const id = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding: {
				type: "slack",
				installId: "si_1",
				channelId: "C1",
				threadTs: "1.1",
			},
		});
		expect(id).toBeTypeOf("string");
	});

	it("is idempotent — second call with same binding returns same id", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const binding = {
			type: "slack" as const,
			installId: "si_1",
			channelId: "C1",
			threadTs: "1.1",
		};
		const id1 = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding,
		});
		const id2 = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding,
		});
		expect(id2).toBe(id1);
	});

	it("different threadTs on same channel creates separate threads", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const base = { type: "slack" as const, installId: "si_1", channelId: "C1" };
		const id1 = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding: { ...base, threadTs: "1.1" },
		});
		const id2 = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding: { ...base, threadTs: "2.2" },
		});
		expect(id2).not.toBe(id1);
	});

	it("same binding in a different org creates a distinct thread", async () => {
		const t = newTest();
		const agentA = await seedAgent(t);
		const agentB = await t
			.withIdentity({ subject: "user_b" })
			.mutation(api.agents.mutations.createAgent.default, {
				...baseAgentArgs,
				orgId: "org_B",
			});

		const binding = {
			type: "slack" as const,
			installId: "si_shared",
			channelId: "C1",
			threadTs: "1.1",
		};
		const idA = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId: agentA,
			binding,
		});
		const idB = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_B",
			agentId: agentB,
			binding,
		});
		expect(idA).not.toBe(idB);
	});

	it("web binding is idempotent by userId", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const binding = { type: "web" as const, userId };
		const id1 = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding,
		});
		const id2 = await t.mutation(internal.threads.mutations.ensureThread.default, {
			orgId: "org_A",
			agentId,
			binding,
		});
		expect(id2).toBe(id1);
	});
});
