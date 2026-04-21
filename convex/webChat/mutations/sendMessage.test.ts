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

async function seedUserAndThread(t: ReturnType<typeof newTest>) {
	const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const caller = t.withIdentity({ subject: userId });
	await caller.mutation(api.agents.mutations.createAgent.default, baseAgent);
	const threadId = await caller.mutation(api.webChat.mutations.createThread.default, {
		orgId: "org_A",
	});
	return { userId, caller, threadId };
}

describe("M1-T11 webChat.sendMessage", () => {
	it("requires authentication", async () => {
		const t = newTest();
		const { threadId } = await seedUserAndThread(t);
		await expect(
			t.mutation(api.webChat.mutations.sendMessage.default, { threadId, text: "hi" }),
		).rejects.toThrow(/Authentication required/);
	});

	it("rejects when the caller is not the thread owner", async () => {
		const t = newTest();
		const { threadId } = await seedUserAndThread(t);
		const otherId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const intruder = t.withIdentity({ subject: otherId });
		await expect(
			intruder.mutation(api.webChat.mutations.sendMessage.default, {
				threadId,
				text: "hi",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("schedules handleIncoming with the thread + sanitized text", async () => {
		const t = newTest();
		const { caller, threadId, userId } = await seedUserAndThread(t);
		await caller.mutation(api.webChat.mutations.sendMessage.default, {
			threadId,
			text: "  hello  ",
		});

		const jobs = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
		const runners = jobs.filter((j) => j.name.includes("agentRunner/actions/handleIncoming"));
		expect(runners).toHaveLength(1);
		expect(runners[0]?.args[0]).toMatchObject({
			orgId: "org_A",
			threadId,
			userMessage: { text: "hello", senderId: userId },
		});

		await t.finishAllScheduledFunctions(() => undefined);
	});

	it("ignores empty text (trim) — no scheduling", async () => {
		const t = newTest();
		const { caller, threadId } = await seedUserAndThread(t);
		await caller.mutation(api.webChat.mutations.sendMessage.default, {
			threadId,
			text: "   ",
		});
		const jobs = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
		expect(jobs).toHaveLength(0);
	});
});
