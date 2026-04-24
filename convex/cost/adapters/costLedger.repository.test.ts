import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { Id } from "../../_generated/dataModel";
import type { NewCostLedger } from "../domain/costLedger.model";
import { CostLedgerRepository } from "./costLedger.repository";

async function seedFixtures(t: ReturnType<typeof newTest>) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {});
		const agentA = await ctx.db.insert("agents", {
			orgId: "org_A",
			slug: "a",
			name: "A",
			systemPrompt: "sp",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
			isDefault: true,
			toolsAllowlist: [],
		});
		const agentB = await ctx.db.insert("agents", {
			orgId: "org_A",
			slug: "b",
			name: "B",
			systemPrompt: "sp",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
			isDefault: false,
			toolsAllowlist: [],
		});
		const threadId1 = await ctx.db.insert("threads", {
			orgId: "org_A",
			agentId: agentA,
			agentThreadId: "pending:1",
			bindingKey: "web:u1",
			binding: { type: "web", userId },
		});
		const threadId2 = await ctx.db.insert("threads", {
			orgId: "org_A",
			agentId: agentA,
			agentThreadId: "pending:2",
			bindingKey: "web:u2",
			binding: { type: "web", userId },
		});
		return { agentA, agentB, threadId1, threadId2 };
	});
}

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>;

function entry(
	fx: Fixtures,
	overrides: Partial<NewCostLedger> & Pick<NewCostLedger, "createdAt"> = {
		createdAt: 0,
	},
): NewCostLedger {
	return {
		orgId: "org_A",
		agentId: fx.agentA,
		threadId: fx.threadId1,
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		tokensIn: 100,
		tokensOut: 50,
		cacheRead: 0,
		cacheWrite: 0,
		costUsd: 0.001,
		...overrides,
	};
}

async function insertRow(
	t: ReturnType<typeof newTest>,
	data: NewCostLedger,
): Promise<Id<"costLedger">> {
	return await t.run(async (ctx) => ctx.db.insert("costLedger", data));
}

describe("M2-T14 CostLedgerRepository", () => {
	it("base CRUD: create persists + get roundtrips the row", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);
		const data = entry(fx, { createdAt: 1_000, costUsd: 0.0123 });

		const { id, reloaded } = await t.run(async (ctx) => {
			const agg = await CostLedgerRepository.create(ctx, data);
			const got = await CostLedgerRepository.get(ctx, agg.getModel()._id);
			return { id: agg.getModel()._id, reloaded: got?.getModel() ?? null };
		});

		expect(id).toBeDefined();
		expect(reloaded?.costUsd).toBe(0.0123);
		expect(reloaded?.orgId).toBe("org_A");
	});

	it("sumByOrgInRange totals tokens + cost + row count across the window", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);
		await insertRow(t, entry(fx, { createdAt: 100, tokensIn: 10, tokensOut: 5, costUsd: 0.001 }));
		await insertRow(t, entry(fx, { createdAt: 200, tokensIn: 20, tokensOut: 10, costUsd: 0.002 }));
		await insertRow(t, entry(fx, { createdAt: 300, tokensIn: 30, tokensOut: 15, costUsd: 0.003 }));
		// Outside the window (below `from`): must be excluded.
		await insertRow(t, entry(fx, { createdAt: 50, tokensIn: 999, tokensOut: 999, costUsd: 9.99 }));
		// Outside the window (at `to`, exclusive): must be excluded.
		await insertRow(t, entry(fx, { createdAt: 400, tokensIn: 999, tokensOut: 999, costUsd: 9.99 }));

		const { sum, truncated } = await t.run(async (ctx) =>
			CostLedgerRepository.sumByOrgInRange(ctx, { orgId: "org_A", from: 100, to: 400 }),
		);

		expect(truncated).toBe(false);
		expect(sum.tokensIn).toBe(60);
		expect(sum.tokensOut).toBe(30);
		expect(sum.costUsd).toBeCloseTo(0.006, 5);
		expect(sum.count).toBe(3);
	});

	it("sumByOrgInRange ignores rows from other orgs", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);
		await insertRow(t, entry(fx, { createdAt: 100, costUsd: 0.01 }));
		await insertRow(t, entry(fx, { orgId: "org_B", createdAt: 100, costUsd: 999 }));

		const { sum } = await t.run(async (ctx) =>
			CostLedgerRepository.sumByOrgInRange(ctx, { orgId: "org_A", from: 0, to: 1_000 }),
		);
		expect(sum.costUsd).toBeCloseTo(0.01, 5);
		expect(sum.count).toBe(1);
	});

	it("topThreadsByCost orders by total cost desc and caps at limit", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);
		// thread1: 2 rows summing 0.003
		await insertRow(t, entry(fx, { threadId: fx.threadId1, createdAt: 100, costUsd: 0.001 }));
		await insertRow(t, entry(fx, { threadId: fx.threadId1, createdAt: 200, costUsd: 0.002 }));
		// thread2: 1 row costing 0.010 (should be first)
		await insertRow(t, entry(fx, { threadId: fx.threadId2, createdAt: 150, costUsd: 0.01 }));

		const top = await t.run(async (ctx) =>
			CostLedgerRepository.topThreadsByCost(ctx, {
				orgId: "org_A",
				from: 0,
				to: 1_000,
				limit: 10,
			}),
		);

		expect(top).toHaveLength(2);
		expect(top[0]?.threadId).toBe(fx.threadId2);
		expect(top[0]?.sum.costUsd).toBeCloseTo(0.01, 5);
		expect(top[1]?.threadId).toBe(fx.threadId1);
		expect(top[1]?.sum.costUsd).toBeCloseTo(0.003, 5);
		expect(top[1]?.sum.count).toBe(2);
	});

	it("topThreadsByCost respects a custom limit", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);
		await insertRow(t, entry(fx, { threadId: fx.threadId1, createdAt: 100, costUsd: 0.01 }));
		await insertRow(t, entry(fx, { threadId: fx.threadId2, createdAt: 100, costUsd: 0.005 }));

		const top = await t.run(async (ctx) =>
			CostLedgerRepository.topThreadsByCost(ctx, {
				orgId: "org_A",
				from: 0,
				to: 1_000,
				limit: 1,
			}),
		);

		expect(top).toHaveLength(1);
		expect(top[0]?.threadId).toBe(fx.threadId1);
	});

	it("topToolsByCost aggregates by toolName and ignores LLM-only rows", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);
		// Two tool-call rows: http.fetch $0.005, sandbox.bash $0.01.
		await insertRow(t, entry(fx, { createdAt: 100, toolName: "http.fetch", costUsd: 0.005 }));
		await insertRow(t, entry(fx, { createdAt: 200, toolName: "sandbox.bash", costUsd: 0.01 }));
		await insertRow(t, entry(fx, { createdAt: 300, toolName: "http.fetch", costUsd: 0.002 }));
		// LLM step (no toolName): must be excluded from the tool breakdown.
		await insertRow(t, entry(fx, { createdAt: 400, stepType: "text-generation", costUsd: 0.1 }));

		const top = await t.run(async (ctx) =>
			CostLedgerRepository.topToolsByCost(ctx, {
				orgId: "org_A",
				from: 0,
				to: 1_000,
			}),
		);

		expect(top).toHaveLength(2);
		expect(top[0]?.toolName).toBe("sandbox.bash");
		expect(top[0]?.sum.costUsd).toBeCloseTo(0.01, 5);
		expect(top[0]?.sum.count).toBe(1);
		expect(top[1]?.toolName).toBe("http.fetch");
		expect(top[1]?.sum.costUsd).toBeCloseTo(0.007, 5);
		expect(top[1]?.sum.count).toBe(2);
	});

	it("topToolsByCost returns empty array when no tool rows exist", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);
		await insertRow(t, entry(fx, { createdAt: 100, stepType: "text-generation", costUsd: 0.1 }));

		const top = await t.run(async (ctx) =>
			CostLedgerRepository.topToolsByCost(ctx, { orgId: "org_A", from: 0, to: 1_000 }),
		);
		expect(top).toEqual([]);
	});
});
