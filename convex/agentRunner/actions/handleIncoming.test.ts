import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { mockErrorModel, mockTextModel } from "../../../test/_helpers/mockLanguageModel";
import { http, HttpResponse, server } from "../../../test/_helpers/msw";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { encrypt, generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import { _clearAgentCache, _setLanguageModelOverride } from "../../agents/_libs/agentFactory";
import { listThreadMessages } from "../../agents/adapters/threadBridge";

const ORG = "org_A";
const ORIGINAL_KEY = process.env.CREDS_MASTER_KEY;

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

async function seedSlackInstall(t: ReturnType<typeof newTest>): Promise<Id<"slackInstalls">> {
	const botTokenEnc = await encrypt("xoxb-real");
	return t.run(async (ctx) =>
		ctx.db.insert("slackInstalls", {
			orgId: ORG,
			teamId: "T1",
			teamName: "T",
			botTokenEnc,
			scope: "app_mentions:read",
			botUserId: "UBOT",
		}),
	);
}

type SlackPostBody = {
	channel: string;
	text: string;
	thread_ts?: string;
};
type SlackUpdateBody = { channel: string; ts: string; text: string };

function captureSlackCalls() {
	const posts: SlackPostBody[] = [];
	const updates: SlackUpdateBody[] = [];
	let postCounter = 1;
	server.use(
		http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
			const body = (await request.json()) as SlackPostBody;
			posts.push(body);
			const ts = `${100 + postCounter}.000${postCounter}`;
			postCounter += 1;
			return HttpResponse.json({ ok: true, channel: body.channel, ts });
		}),
		http.post("https://slack.com/api/chat.update", async ({ request }) => {
			const body = (await request.json()) as SlackUpdateBody;
			updates.push(body);
			return HttpResponse.json({ ok: true, channel: body.channel, ts: body.ts });
		}),
	);
	return { posts, updates };
}

describe("M2-T01 agentRunner.handleIncoming real streamText", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
		_clearAgentCache();
	});
	afterEach(() => {
		_setLanguageModelOverride(null);
		_clearAgentCache();
		if (ORIGINAL_KEY === undefined) {
			// biome-ignore lint/performance/noDelete: env isolation between tests
			delete process.env.CREDS_MASTER_KEY;
		} else {
			process.env.CREDS_MASTER_KEY = ORIGINAL_KEY;
		}
	});

	it("slack binding (no tools): paints live via postMessage + final chat.update, persists parentTs", async () => {
		_setLanguageModelOverride(mockTextModel("hi there"));

		const t = newTest();
		const agentId = await seedAgent(t);
		const installId = await seedSlackInstall(t);
		const threadId = await seedThread(t, agentId, {
			type: "slack",
			installId,
			channelId: "C1",
			threadTs: "1.1",
		});
		const { posts, updates } = captureSlackCalls();

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "hello", senderId: "U1" },
		});

		const msgs = await readMessages(t, threadId);
		expect(msgs).toHaveLength(2);
		expect(msgs[0]).toMatchObject({ role: "user", text: "hello" });
		expect(msgs[1]).toMatchObject({ role: "assistant", text: "hi there" });

		// Painter: `start()` posts the anchor eagerly (italic
		// "thinking..." placeholder), text-deltas may emit intermediate
		// updates, and `flushFinal` lands the polished final text.
		expect(posts).toHaveLength(1);
		expect(posts[0]).toMatchObject({ channel: "C1", thread_ts: "1.1" });
		expect(posts[0]?.text).toBe("_thinking..._");
		expect(posts[0]?.text).not.toContain("hi there");
		expect(updates.length).toBeGreaterThanOrEqual(1);
		const lastUpdate = updates.at(-1);
		expect(lastUpdate).toMatchObject({
			channel: "C1",
			ts: "101.0001",
			text: "hi there",
		});

		const updatedThread = await t.run(async (ctx) => ctx.db.get(threadId));
		expect(updatedThread?.binding.type).toBe("slack");
		if (updatedThread?.binding.type === "slack") {
			// First mocked post ts: `${100+1}.000${1}` → "101.0001"
			expect(updatedThread.binding.parentTs).toBe("101.0001");
		}
	});

	it("web binding: persists both messages, never touches slack API", async () => {
		_setLanguageModelOverride(mockTextModel("olá!"));

		const t = newTest();
		const agentId = await seedAgent(t);
		const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const threadId = await seedThread(t, agentId, { type: "web", userId });
		const { posts, updates } = captureSlackCalls();

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "oi", senderId: userId },
		});

		const msgs = await readMessages(t, threadId);
		expect(msgs.map((m) => m.role)).toEqual(expect.arrayContaining(["user", "assistant"]));
		expect(msgs.find((m) => m.role === "assistant")?.text).toBe("olá!");
		expect(posts).toHaveLength(0);
		expect(updates).toHaveLength(0);
	});

	it("event binding: persists both messages, never touches slack API", async () => {
		_setLanguageModelOverride(mockTextModel("tock"));

		const t = newTest();
		const agentId = await seedAgent(t);
		const threadId = await seedThread(t, agentId, { type: "event", eventId: "ev_1" });
		const { posts, updates } = captureSlackCalls();

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "tick" },
		});

		const msgs = await readMessages(t, threadId);
		expect(msgs).toHaveLength(2);
		expect(msgs[1]?.text).toBe("tock");
		expect(posts).toHaveLength(0);
		expect(updates).toHaveLength(0);
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

	it("slack: stream throws → painter still flushes a fallback message and re-throws", async () => {
		_setLanguageModelOverride(mockErrorModel("provider blew up"));

		const t = newTest();
		const agentId = await seedAgent(t);
		const installId = await seedSlackInstall(t);
		const threadId = await seedThread(t, agentId, {
			type: "slack",
			installId,
			channelId: "C1",
			threadTs: "1.1",
		});
		const { posts, updates } = captureSlackCalls();

		await expect(
			t.action(internal.agentRunner.actions.handleIncoming.default, {
				orgId: ORG,
				threadId,
				userMessage: { text: "boom", senderId: "U1" },
			}),
		).rejects.toThrow();

		// painter.start() posts the placeholder anchor; flushFinal then
		// edits it to the fallback so the user never sees a half-rendered
		// live state stuck in the channel.
		expect(posts).toHaveLength(1);
		expect(posts[0]?.text).toBe("_thinking..._");
		expect(updates).toHaveLength(1);
		expect(updates[0]?.text).toBe("_(erro ao gerar resposta — tente novamente)_");
	});

	it("empty text: skips — no writes, no slack calls, no LLM call", async () => {
		const mock = mockTextModel("should not be called");
		_setLanguageModelOverride(mock);

		const t = newTest();
		const agentId = await seedAgent(t);
		const threadId = await seedThread(t, agentId, {
			type: "slack",
			installId: "si_1",
			channelId: "C1",
		});
		const { posts, updates } = captureSlackCalls();

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: ORG,
			threadId,
			userMessage: { text: "   " },
		});

		const msgs = await readMessages(t, threadId);
		expect(msgs).toHaveLength(0);
		expect(posts).toHaveLength(0);
		expect(updates).toHaveLength(0);
		expect(mock.doStreamCalls).toHaveLength(0);
	});
});
