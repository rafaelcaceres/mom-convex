import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const baseAgent = {
	orgId: "org_A",
	slug: "default",
	name: "Default",
	systemPrompt: "You are mom.",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
};

async function seed(t: ReturnType<typeof newTest>) {
	const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const caller = t.withIdentity({ subject: userId });
	await caller.mutation(api.agents.mutations.createAgent.default, baseAgent);
	const threadId = await caller.mutation(api.webChat.mutations.createThread.default, {
		orgId: "org_A",
	});
	const agentId = await t.run(async (ctx) => {
		const a = await ctx.db
			.query("agents")
			.withIndex("by_org_slug", (q) => q.eq("orgId", "org_A").eq("slug", "default"))
			.unique();
		if (!a) throw new Error("seed agent missing");
		return a._id as Id<"agents">;
	});
	return { userId, caller, threadId, agentId };
}

async function insertLedgerRow(
	t: ReturnType<typeof newTest>,
	args: {
		orgId: string;
		agentId: Id<"agents">;
		threadId: Id<"threads">;
		costUsd: number;
		tokensIn?: number;
		tokensOut?: number;
		toolName?: string;
		stepType?: string;
		createdAt?: number;
	},
) {
	await t.run(async (ctx) =>
		ctx.db.insert("costLedger", {
			orgId: args.orgId,
			agentId: args.agentId,
			threadId: args.threadId,
			provider: "anthropic",
			model: "claude-sonnet-4-5",
			tokensIn: args.tokensIn ?? 0,
			tokensOut: args.tokensOut ?? 0,
			cacheRead: 0,
			cacheWrite: 0,
			costUsd: args.costUsd,
			createdAt: args.createdAt ?? Date.now(),
			...(args.stepType ? { stepType: args.stepType } : {}),
			...(args.toolName ? { toolName: args.toolName } : {}),
		}),
	);
}

describe("M2-T18 cost.queries.byThread", () => {
	it("requires authentication", async () => {
		const t = newTest();
		const { threadId } = await seed(t);
		await expect(t.query(api.cost.queries.byThread.default, { threadId })).rejects.toThrow(
			/Authentication required/,
		);
	});

	it("forbids non-owners (different user)", async () => {
		const t = newTest();
		const { threadId } = await seed(t);
		const other = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const intruder = t.withIdentity({ subject: other });
		await expect(intruder.query(api.cost.queries.byThread.default, { threadId })).rejects.toThrow(
			/Forbidden/,
		);
	});

	it("returns sum + per-tool breakdown for the thread, ignoring siblings", async () => {
		const t = newTest();
		const { caller, threadId, agentId } = await seed(t);

		// LLM step
		await insertLedgerRow(t, {
			orgId: "org_A",
			agentId,
			threadId,
			tokensIn: 200,
			tokensOut: 80,
			costUsd: 0.0123,
			stepType: "text-generation",
		});
		// Two tool calls
		await insertLedgerRow(t, {
			orgId: "org_A",
			agentId,
			threadId,
			toolName: "http.fetch",
			costUsd: 0,
			stepType: "tool-call",
		});
		await insertLedgerRow(t, {
			orgId: "org_A",
			agentId,
			threadId,
			toolName: "sandbox.bash",
			costUsd: 0,
			stepType: "tool-call",
		});

		// Sibling thread row — must NOT count. createThread is 1-per-user (web
		// binding key = `web:${userId}` is unique), so we hand-craft a second
		// thread row directly via the DB to break that invariant for the test.
		const siblingThreadId = await t.run(async (ctx) => {
			const otherUser = await ctx.db.insert("users", {});
			return await ctx.db.insert("threads", {
				orgId: "org_A",
				agentId,
				agentThreadId: "pending:sibling",
				bindingKey: `web:${otherUser}`,
				binding: { type: "web", userId: otherUser },
			});
		});
		await insertLedgerRow(t, {
			orgId: "org_A",
			agentId,
			threadId: siblingThreadId,
			tokensIn: 999,
			costUsd: 9.99,
		});

		const summary = await caller.query(api.cost.queries.byThread.default, { threadId });
		expect(summary.sum.costUsd).toBeCloseTo(0.0123, 5);
		expect(summary.sum.tokensIn).toBe(200);
		expect(summary.sum.tokensOut).toBe(80);
		expect(summary.sum.count).toBe(3);
		expect(summary.truncated).toBe(false);
		const tools = summary.byTool.map((b) => b.toolName).sort();
		expect(tools).toEqual(["http.fetch", "sandbox.bash"]);
	});

	it("returns empty sum + empty byTool for a fresh thread", async () => {
		const t = newTest();
		const { caller, threadId } = await seed(t);
		const summary = await caller.query(api.cost.queries.byThread.default, { threadId });
		expect(summary.sum.count).toBe(0);
		expect(summary.sum.costUsd).toBe(0);
		expect(summary.byTool).toEqual([]);
		expect(summary.truncated).toBe(false);
	});
});
