import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { Id } from "../../_generated/dataModel";
import type { SandboxStatus } from "../domain/sandbox.model";
import { SandboxRepository } from "./sandbox.repository";

async function seedFixtures(t: ReturnType<typeof newTest>) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {});
		const agentId = await ctx.db.insert("agents", {
			orgId: "org_A",
			slug: "default",
			name: "Default",
			systemPrompt: "sp",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
			isDefault: true,
			toolsAllowlist: [],
		});
		const threadId1 = await ctx.db.insert("threads", {
			orgId: "org_A",
			agentId,
			agentThreadId: "pending:1",
			bindingKey: "web:u1",
			binding: { type: "web", userId },
		});
		const threadId2 = await ctx.db.insert("threads", {
			orgId: "org_A",
			agentId,
			agentThreadId: "pending:2",
			bindingKey: "web:u2",
			binding: { type: "web", userId },
		});
		return { agentId, threadId1, threadId2 };
	});
}

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>;

async function insertSandbox(
	t: ReturnType<typeof newTest>,
	doc: {
		orgId?: string;
		threadId: Id<"threads">;
		sandboxId?: string;
		status?: SandboxStatus;
		createdAt?: number;
		lastUsedAt: number;
		persistentId?: string;
	},
): Promise<Id<"sandboxes">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("sandboxes", {
			orgId: doc.orgId ?? "org_A",
			threadId: doc.threadId,
			provider: "vercel",
			sandboxId: doc.sandboxId ?? `sbx_${Math.random().toString(36).slice(2, 8)}`,
			persistentId: doc.persistentId,
			status: doc.status ?? "active",
			createdAt: doc.createdAt ?? doc.lastUsedAt,
			lastUsedAt: doc.lastUsedAt,
		});
	});
}

describe("M2-T10 SandboxRepository", () => {
	it("getByThread returns the active sandbox for that thread", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);
		await insertSandbox(t, { threadId: fx.threadId1, sandboxId: "sbx_1", lastUsedAt: 100 });

		const result = await t.run(async (ctx) => {
			const agg = await SandboxRepository.getByThread(ctx, fx.threadId1);
			return agg?.getModel() ?? null;
		});
		expect(result?.sandboxId).toBe("sbx_1");
		expect(result?.status).toBe("active");
	});

	it("getByThread returns null when the thread has no sandbox", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);

		const result = await t.run(async (ctx) => {
			return await SandboxRepository.getByThread(ctx, fx.threadId1);
		});
		expect(result).toBeNull();
	});

	it("getByThread skips destroyed sandboxes", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);
		await insertSandbox(t, {
			threadId: fx.threadId1,
			sandboxId: "sbx_gone",
			status: "destroyed",
			lastUsedAt: 100,
		});

		const result = await t.run(async (ctx) => {
			return await SandboxRepository.getByThread(ctx, fx.threadId1);
		});
		expect(result).toBeNull();
	});

	it("getByThread returns a stopped (suspended) sandbox", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);
		await insertSandbox(t, {
			threadId: fx.threadId1,
			sandboxId: "sbx_stopped",
			status: "stopped",
			lastUsedAt: 100,
			persistentId: "psb_x",
		});

		const result = await t.run(async (ctx) => {
			const agg = await SandboxRepository.getByThread(ctx, fx.threadId1);
			return agg?.getModel() ?? null;
		});
		expect(result?.status).toBe("stopped");
		expect(result?.persistentId).toBe("psb_x");
	});

	it("getByThread prefers an active sandbox when both active and destroyed exist", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);
		await insertSandbox(t, {
			threadId: fx.threadId1,
			sandboxId: "sbx_old",
			status: "destroyed",
			lastUsedAt: 100,
		});
		await insertSandbox(t, {
			threadId: fx.threadId1,
			sandboxId: "sbx_new",
			status: "active",
			lastUsedAt: 200,
		});

		const result = await t.run(async (ctx) => {
			const agg = await SandboxRepository.getByThread(ctx, fx.threadId1);
			return agg?.getModel() ?? null;
		});
		expect(result?.sandboxId).toBe("sbx_new");
	});

	it("markUsed bumps lastUsedAt on the row", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);
		const id = await insertSandbox(t, { threadId: fx.threadId1, lastUsedAt: 100 });

		await t.run(async (ctx) => {
			await SandboxRepository.markUsed(ctx, id, 9_999);
		});

		const reloaded = await t.run(async (ctx) => {
			const agg = await SandboxRepository.get(ctx, id);
			return agg?.getModel() ?? null;
		});
		expect(reloaded?.lastUsedAt).toBe(9_999);
	});

	it("markDestroyed flips status to 'destroyed'", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);
		const id = await insertSandbox(t, { threadId: fx.threadId1, lastUsedAt: 100 });

		await t.run(async (ctx) => {
			await SandboxRepository.markDestroyed(ctx, id);
		});

		const reloaded = await t.run(async (ctx) => {
			const agg = await SandboxRepository.get(ctx, id);
			return agg?.getModel() ?? null;
		});
		expect(reloaded?.status).toBe("destroyed");
	});

	it("listIdle returns active sandboxes older than the threshold", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);
		await insertSandbox(t, {
			threadId: fx.threadId1,
			sandboxId: "sbx_fresh",
			lastUsedAt: 9_000,
		});
		await insertSandbox(t, {
			threadId: fx.threadId2,
			sandboxId: "sbx_stale",
			lastUsedAt: 1_000,
		});

		const ids = await t.run(async (ctx) => {
			const rows = await SandboxRepository.listIdle(ctx, { olderThanMs: 5_000, now: 10_000 });
			return rows.map((r) => r.getModel().sandboxId).sort();
		});
		expect(ids).toEqual(["sbx_stale"]);
	});

	it("listIdle excludes destroyed and stopped sandboxes", async () => {
		const t = newTest();
		const fx: Fixtures = await seedFixtures(t);
		await insertSandbox(t, {
			threadId: fx.threadId1,
			sandboxId: "sbx_destroyed",
			status: "destroyed",
			lastUsedAt: 0,
		});
		await insertSandbox(t, {
			threadId: fx.threadId2,
			sandboxId: "sbx_stopped",
			status: "stopped",
			lastUsedAt: 0,
		});

		const ids = await t.run(async (ctx) => {
			const rows = await SandboxRepository.listIdle(ctx, { olderThanMs: 1, now: 1_000_000 });
			return rows.map((r) => r.getModel().sandboxId);
		});
		expect(ids).toEqual([]);
	});
});
