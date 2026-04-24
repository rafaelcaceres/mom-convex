import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { mockTextModel } from "../../../test/_helpers/mockLanguageModel";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { _clearAgentCache, _setLanguageModelOverride } from "../../agents/_libs/agentFactory";
import { listThreadMessages } from "../../agents/adapters/threadBridge";

const ORG = "org_A";

const baseAgentArgs = {
	orgId: ORG,
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

type Binding =
	| { type: "slack"; installId: string; channelId: string; threadTs?: string }
	| { type: "web"; userId: Id<"users"> }
	| { type: "event"; eventId: string };

async function seedThread(
	t: ReturnType<typeof newTest>,
	agentId: Id<"agents">,
	binding: Binding,
): Promise<Id<"threads">> {
	return t.mutation(internal.threads.mutations.ensureThread.default, {
		orgId: ORG,
		agentId,
		binding,
	});
}

async function readMessages(t: ReturnType<typeof newTest>, threadId: Id<"threads">) {
	return t.run(async (ctx) => {
		const thread = await ctx.db.get(threadId);
		if (!thread) throw new Error("thread not found");
		const page = await listThreadMessages(ctx, { agentThreadId: thread.agentThreadId });
		return page.page
			.filter((d) => d.message?.role === "user" || d.message?.role === "assistant")
			.map((d) => ({
				role: d.message?.role,
				text: d.text ?? "",
				userId: d.userId,
				_creationTime: d._creationTime,
			}))
			.sort((a, b) => a._creationTime - b._creationTime);
	});
}

async function listScheduled(t: ReturnType<typeof newTest>) {
	return t.run(async (ctx) => {
		const jobs = await ctx.db.system.query("_scheduled_functions").collect();
		return jobs;
	});
}

async function listScheduledPostMessage(t: ReturnType<typeof newTest>) {
	const jobs = await listScheduled(t);
	return jobs.filter((j) => j.name.includes("postMessage"));
}

describe("M2-T01 agentRunner.handleIncoming real streamText", () => {
	beforeEach(() => {
		_clearAgentCache();
	});
	afterEach(() => {
		_setLanguageModelOverride(null);
		_clearAgentCache();
	});

	it("slack binding: persists user + streamed assistant reply and schedules slack postMessage with the real LLM text", async () => {
		_setLanguageModelOverride(mockTextModel("hi there"));

		const t = newTest();
		const agentId = await seedAgent(t);
		const installId = await t.run(async (ctx) =>
			ctx.db.insert("slackInstalls", {
				orgId: ORG,
				teamId: "T1",
				teamName: "T",
				botTokenEnc: { ciphertextB64: "c", nonceB64: "n", kid: "k1" },
				scope: "app_mentions:read",
				botUserId: "UBOT",
			}),
		);
		const threadId = await seedThread(t, agentId, {
			type: "slack",
			installId,
			channelId: "C1",
			threadTs: "1.1",
		});

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "hello", senderId: "U1" },
		});

		const msgs = await readMessages(t, threadId);
		expect(msgs).toHaveLength(2);
		expect(msgs[0]).toMatchObject({ role: "user", text: "hello" });
		expect(msgs[1]).toMatchObject({ role: "assistant", text: "hi there" });

		const scheduled = await listScheduledPostMessage(t);
		expect(scheduled).toHaveLength(1);
		const job = scheduled[0];
		if (!job) throw new Error("unreachable");
		expect(job.args[0]).toMatchObject({
			installId,
			channelId: "C1",
			threadTs: "1.1",
			text: "hi there",
		});

		await t.finishAllScheduledFunctions(() => undefined);
	});

	it("web binding: persists both messages, schedules no slack postMessage", async () => {
		_setLanguageModelOverride(mockTextModel("olá!"));

		const t = newTest();
		const agentId = await seedAgent(t);
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const threadId = await seedThread(t, agentId, { type: "web", userId });

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "oi", senderId: userId },
		});

		const msgs = await readMessages(t, threadId);
		expect(msgs.map((m) => m.role)).toEqual(expect.arrayContaining(["user", "assistant"]));
		expect(msgs.find((m) => m.role === "assistant")?.text).toBe("olá!");

		const scheduled = await listScheduledPostMessage(t);
		expect(scheduled).toHaveLength(0);
	});

	it("event binding: persists both messages, no slack dispatch", async () => {
		_setLanguageModelOverride(mockTextModel("tock"));

		const t = newTest();
		const agentId = await seedAgent(t);
		const threadId = await seedThread(t, agentId, { type: "event", eventId: "ev_1" });

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "tick" },
		});

		const msgs = await readMessages(t, threadId);
		expect(msgs).toHaveLength(2);
		expect(msgs[1]?.text).toBe("tock");
		const scheduled = await listScheduledPostMessage(t);
		expect(scheduled).toHaveLength(0);
	});

	it("records a costLedger row per LLM step with priced token usage (M2-T15)", async () => {
		_setLanguageModelOverride(mockTextModel("ok"));

		const t = newTest();
		const agentId = await seedAgent(t);
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const threadId = await seedThread(t, agentId, { type: "web", userId });

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "hi", senderId: userId },
		});

		const rows = await t.run(async (ctx) =>
			ctx.db
				.query("costLedger")
				.withIndex("by_thread", (q) => q.eq("threadId", threadId))
				.collect(),
		);
		expect(rows).toHaveLength(1);
		const row = rows[0];
		expect(row).toMatchObject({
			orgId: ORG,
			threadId,
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			tokensIn: 1,
			tokensOut: 1,
			cacheRead: 0,
			cacheWrite: 0,
			stepType: "text-generation",
		});
		expect(row?.toolName).toBeUndefined();
		// Mock token counts (1 in, 1 out) * sonnet-4.5 pricing ($3/M + $15/M)
		// → costUsd > 0 but tiny. Just assert it's priced, not the exact micro-dollar.
		expect(row?.costUsd).toBeGreaterThan(0);
		expect(row?.costUsd).toBeLessThan(0.0001);
	});

	it("empty text: skips — no writes, no scheduling, no LLM call", async () => {
		const mock = mockTextModel("should not be called");
		_setLanguageModelOverride(mock);

		const t = newTest();
		const agentId = await seedAgent(t);
		const threadId = await seedThread(t, agentId, {
			type: "slack",
			installId: "si_1",
			channelId: "C1",
		});

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "   " },
		});

		const msgs = await readMessages(t, threadId);
		expect(msgs).toHaveLength(0);
		const scheduled = await listScheduledPostMessage(t);
		expect(scheduled).toHaveLength(0);
		expect(mock.doStreamCalls).toHaveLength(0);
	});
});
