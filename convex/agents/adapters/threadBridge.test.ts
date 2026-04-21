import type { Agent } from "@convex-dev/agent";
import { describe, expect, it, vi } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { ActionCtx } from "../../_generated/server";
import {
	DEFAULT_RECENT_MESSAGES,
	createAgentThread,
	listThreadMessages,
	saveAssistantMessage,
	saveUserMessage,
	streamAssistantReply,
} from "./threadBridge";

describe("M2-T01 threadBridge", () => {
	it("createAgentThread returns a non-empty string id", async () => {
		const t = newTest();
		const id = await t.run(async (ctx) => {
			return await createAgentThread(ctx, { userId: "user_1" });
		});
		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);
	});

	it("saveUserMessage persists via the component and is readable back", async () => {
		const t = newTest();
		const { messages } = await t.run(async (ctx) => {
			const agentThreadId = await createAgentThread(ctx, { userId: "user_1" });
			await saveUserMessage(ctx, {
				agentThreadId,
				text: "olá",
				userId: "user_1",
			});
			const page = await listThreadMessages(ctx, { agentThreadId });
			return { messages: page.page };
		});
		const user = messages.find((m) => m.message?.role === "user");
		expect(user).toBeDefined();
		expect(user?.text).toBe("olá");
	});

	describe("streamAssistantReply contextOptions", () => {
		function stubAgent(): { agent: Agent; streamText: ReturnType<typeof vi.fn> } {
			const streamText = vi.fn(async () => ({
				text: Promise.resolve("reply"),
			}));
			return { agent: { streamText } as unknown as Agent, streamText };
		}

		it("passes the default recentMessages cap to streamText", async () => {
			const { agent, streamText } = stubAgent();
			const result = await streamAssistantReply({} as ActionCtx, {
				agent,
				agentThreadId: "t_1",
				promptMessageId: "m_1",
			});
			expect(result.text).toBe("reply");
			expect(streamText).toHaveBeenCalledTimes(1);
			const [, , , options] = streamText.mock.calls[0] ?? [];
			expect(options.contextOptions).toEqual({
				recentMessages: DEFAULT_RECENT_MESSAGES,
			});
		});

		it("honours an explicit recentMessages override", async () => {
			const { agent, streamText } = stubAgent();
			await streamAssistantReply({} as ActionCtx, {
				agent,
				agentThreadId: "t_1",
				promptMessageId: "m_1",
				recentMessages: 3,
			});
			const [, , , options] = streamText.mock.calls[0] ?? [];
			expect(options.contextOptions).toEqual({ recentMessages: 3 });
		});
	});

	it("saveAssistantMessage persists an assistant turn", async () => {
		const t = newTest();
		const { messages } = await t.run(async (ctx) => {
			const agentThreadId = await createAgentThread(ctx, { userId: "user_1" });
			await saveUserMessage(ctx, {
				agentThreadId,
				text: "oi",
				userId: "user_1",
			});
			await saveAssistantMessage(ctx, {
				agentThreadId,
				text: "echo: oi",
			});
			const page = await listThreadMessages(ctx, { agentThreadId });
			return { messages: page.page };
		});
		const assistant = messages.find((m) => m.message?.role === "assistant");
		expect(assistant).toBeDefined();
		expect(assistant?.text).toBe("echo: oi");
	});
});
