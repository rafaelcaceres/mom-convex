import { saveMessage } from "@convex-dev/agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { mockEchoModel } from "../../../test/_helpers/mockLanguageModel";
import { api, components, internal } from "../../_generated/api";
import { _clearAgentCache, _setLanguageModelOverride } from "../../agents/_libs/agentFactory";
import { ThreadRepository } from "../../threads/adapters/thread.repository";

const baseAgent = {
	orgId: "org_A",
	slug: "default",
	name: "Default",
	systemPrompt: "You are mom.",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
};

const PAGE = { cursor: null, numItems: 200 };

async function seed(t: ReturnType<typeof newTest>) {
	const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const caller = t.withIdentity({ subject: userId });
	await caller.mutation(api.agents.mutations.createAgent.default, baseAgent);
	const threadId = await caller.mutation(api.webChat.mutations.createThread.default, {
		orgId: "org_A",
	});
	const agentThreadId = await t.run(async (ctx) => {
		const thread = await ThreadRepository.get(ctx, threadId);
		if (!thread) throw new Error("seed thread missing");
		return thread.getModel().agentThreadId;
	});
	return { userId, caller, threadId, agentThreadId };
}

describe("webChat.listUIMessages", () => {
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
		const { threadId } = await seed(t);
		await expect(
			t.query(api.webChat.queries.listUIMessages.default, {
				threadId,
				paginationOpts: PAGE,
			}),
		).rejects.toThrow(/Authentication required/);
	});

	it("forbids non-owners", async () => {
		const t = newTest();
		const { threadId } = await seed(t);
		const other = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const intruder = t.withIdentity({ subject: other });
		await expect(
			intruder.query(api.webChat.queries.listUIMessages.default, {
				threadId,
				paginationOpts: PAGE,
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("returns empty page for fresh thread", async () => {
		const t = newTest();
		const { caller, threadId } = await seed(t);
		const result = await caller.query(api.webChat.queries.listUIMessages.default, {
			threadId,
			paginationOpts: PAGE,
		});
		expect(result.page).toEqual([]);
	});

	it("returns user + assistant messages with text parts after a normal echo turn", async () => {
		const t = newTest();
		const { caller, threadId, userId } = await seed(t);
		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId: "org_A",
			threadId,
			userMessage: { text: "ping", senderId: userId },
		});

		const result = await caller.query(api.webChat.queries.listUIMessages.default, {
			threadId,
			paginationOpts: PAGE,
		});
		const messages = result.page;
		expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
		expect(messages[0]?.text).toBe("ping");
		expect(messages[1]?.text).toBe("echo: ping");
	});

	it("preserves tool-call + tool-result parts in stream order", async () => {
		const t = newTest();
		const { caller, threadId, agentThreadId } = await seed(t);

		await t.run(async (ctx) => {
			await saveMessage(ctx, components.agent, {
				threadId: agentThreadId,
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "let me check that." },
						{
							type: "tool-call",
							toolCallId: "call_1",
							toolName: "http.fetch",
							input: { url: "https://example.com" },
						},
					],
				},
			});
			await saveMessage(ctx, components.agent, {
				threadId: agentThreadId,
				message: {
					role: "tool",
					content: [
						{
							type: "tool-result",
							toolCallId: "call_1",
							toolName: "http.fetch",
							output: { type: "json", value: { status: 200 } },
						},
					],
				},
			});
		});

		const result = await caller.query(api.webChat.queries.listUIMessages.default, {
			threadId,
			paginationOpts: PAGE,
		});
		// Find the assistant message that owns the tool call.
		const assistant = result.page.find((m) => m.role === "assistant");
		expect(assistant).toBeDefined();
		const types = assistant?.parts.map((p) => p.type) ?? [];
		expect(types).toContain("text");
		// Tool parts come either as `tool-<name>` (static) or `dynamic-tool`
		// depending on how the dispatcher registered them.
		const toolPart = assistant?.parts.find(
			(p) => p.type.startsWith("tool-") || p.type === "dynamic-tool",
		) as { state?: string; output?: unknown; toolCallId?: string } | undefined;
		expect(toolPart).toBeDefined();
		// The tool-result merge yields `output-available` (or equivalent) state.
		expect(toolPart?.state === "output-available" || toolPart?.output !== undefined).toBe(true);
	});

	it("preserves reasoning + text parts in the order the model emitted them", async () => {
		const t = newTest();
		const { caller, threadId, agentThreadId } = await seed(t);

		await t.run(async (ctx) => {
			await saveMessage(ctx, components.agent, {
				threadId: agentThreadId,
				message: {
					role: "assistant",
					content: [
						{ type: "reasoning", text: "Let me work this out step by step." },
						{ type: "text", text: "the answer is 42." },
					],
				},
			});
		});

		const result = await caller.query(api.webChat.queries.listUIMessages.default, {
			threadId,
			paginationOpts: PAGE,
		});
		const assistant = result.page.find((m) => m.role === "assistant");
		expect(assistant).toBeDefined();
		const partTypes = assistant?.parts.map((p) => p.type) ?? [];
		// Save order is preserved: reasoning then text.
		const reasoningIdx = partTypes.indexOf("reasoning");
		const textIdx = partTypes.indexOf("text");
		expect(reasoningIdx).toBeGreaterThanOrEqual(0);
		expect(textIdx).toBeGreaterThan(reasoningIdx);
	});

	it("preserves text-then-reasoning order when the model emits reasoning last", async () => {
		const t = newTest();
		const { caller, threadId, agentThreadId } = await seed(t);

		// Gemini-style: text first, reasoning summary after.
		await t.run(async (ctx) => {
			await saveMessage(ctx, components.agent, {
				threadId: agentThreadId,
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "the answer is 42." },
						{ type: "reasoning", text: "i computed it as 6 times 7." },
					],
				},
			});
		});

		const result = await caller.query(api.webChat.queries.listUIMessages.default, {
			threadId,
			paginationOpts: PAGE,
		});
		const assistant = result.page.find((m) => m.role === "assistant");
		const partTypes = assistant?.parts.map((p) => p.type) ?? [];
		const reasoningIdx = partTypes.indexOf("reasoning");
		const textIdx = partTypes.indexOf("text");
		expect(textIdx).toBeGreaterThanOrEqual(0);
		expect(reasoningIdx).toBeGreaterThan(textIdx);
	});
});
