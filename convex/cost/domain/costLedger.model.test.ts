import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { type CostLedger, CostLedgerAgg, EMPTY_COST_SUM, addToSum } from "./costLedger.model";

function makeEntry(overrides: Partial<CostLedger> = {}): CostLedger {
	return {
		_id: "costLedger:1" as unknown as Id<"costLedger">,
		_creationTime: Date.now(),
		orgId: "org_A",
		agentId: "agents:a1" as unknown as Id<"agents">,
		threadId: "threads:t1" as unknown as Id<"threads">,
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		tokensIn: 100,
		tokensOut: 50,
		cacheRead: 0,
		cacheWrite: 0,
		costUsd: 0.005,
		createdAt: 0,
		...overrides,
	};
}

describe("M2-T14 CostLedgerAgg", () => {
	it("getModel returns the underlying doc", () => {
		const doc = makeEntry();
		const agg = new CostLedgerAgg(doc);
		expect(agg.getModel()).toBe(doc);
	});
});

describe("M2-T14 addToSum", () => {
	it("EMPTY_COST_SUM has all zeros", () => {
		expect(EMPTY_COST_SUM).toEqual({
			tokensIn: 0,
			tokensOut: 0,
			cacheRead: 0,
			cacheWrite: 0,
			costUsd: 0,
			count: 0,
		});
	});

	it("adds one row cleanly to an empty sum", () => {
		const result = addToSum(
			{ ...EMPTY_COST_SUM },
			makeEntry({
				tokensIn: 100,
				tokensOut: 50,
				cacheRead: 10,
				cacheWrite: 5,
				costUsd: 0.0123,
			}),
		);
		expect(result).toEqual({
			tokensIn: 100,
			tokensOut: 50,
			cacheRead: 10,
			cacheWrite: 5,
			costUsd: 0.0123,
			count: 1,
		});
	});

	it("accumulates across many rows", () => {
		let sum = { ...EMPTY_COST_SUM };
		for (let i = 0; i < 5; i++) {
			sum = addToSum(sum, makeEntry({ tokensIn: 10, tokensOut: 20, costUsd: 0.01 }));
		}
		expect(sum.tokensIn).toBe(50);
		expect(sum.tokensOut).toBe(100);
		expect(sum.costUsd).toBeCloseTo(0.05, 5);
		expect(sum.count).toBe(5);
	});

	it("is pure (does not mutate the input sum)", () => {
		const sum = { ...EMPTY_COST_SUM };
		addToSum(sum, makeEntry({ tokensIn: 100 }));
		expect(sum.tokensIn).toBe(0);
	});
});
