import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { mockEchoModel } from "../../../test/_helpers/mockLanguageModel";
import { api, internal } from "../../_generated/api";
import { _clearAgentCache, _setLanguageModelOverride } from "../../agents/_libs/agentFactory";

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

describe("M1-T13 webChat.listMessages", () => {
	beforeEach(() => {
		_clearAgentCache();
		_setLanguageModelOverride(mockEchoModel());
	});
	afterEach(() => {
		_setLanguageModelOverride(null);
		_clearAgentCache();
	});

	it("requires authentication", async () => {
		const t = newTest();
		const { threadId } = await seedUserAndThread(t);
		await expect(t.query(api.webChat.queries.listMessages.default, { threadId })).rejects.toThrow(
			/Authentication required/,
		);
	});

	it("forbids non-owners", async () => {
		const t = newTest();
		const { threadId } = await seedUserAndThread(t);
		const otherId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const intruder = t.withIdentity({ subject: otherId });
		await expect(
			intruder.query(api.webChat.queries.listMessages.default, { threadId }),
		).rejects.toThrow(/Forbidden/);
	});

	it("returns empty list for a fresh thread", async () => {
		const t = newTest();
		const { caller, threadId } = await seedUserAndThread(t);
		const rows = await caller.query(api.webChat.queries.listMessages.default, { threadId });
		expect(rows).toEqual([]);
	});

	it("returns user + echo reply ordered by createdAt after the echo runs", async () => {
		const t = newTest();
		const { caller, threadId, userId } = await seedUserAndThread(t);
		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: "org_A",
			threadId,
			userMessage: { text: "ping", senderId: userId },
		});

		const rows = await caller.query(api.webChat.queries.listMessages.default, { threadId });
		expect(rows.map((r) => ({ role: r.role, text: r.text }))).toEqual([
			{ role: "user", text: "ping" },
			{ role: "assistant", text: "echo: ping" },
		]);
	});
});
