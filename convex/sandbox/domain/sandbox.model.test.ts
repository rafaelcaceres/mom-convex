import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { type Sandbox, SandboxAgg } from "./sandbox.model";

function makeSandbox(overrides: Partial<Sandbox> = {}): Sandbox {
	return {
		_id: "sandboxes:1" as unknown as Id<"sandboxes">,
		_creationTime: 0,
		orgId: "org_A",
		threadId: "threads:t1" as unknown as Id<"threads">,
		provider: "vercel",
		sandboxId: "sbx_abc",
		status: "active",
		createdAt: 0,
		lastUsedAt: 0,
		...overrides,
	};
}

describe("M2-T10 SandboxAgg", () => {
	it("getModel returns the underlying doc", () => {
		const doc = makeSandbox();
		const agg = new SandboxAgg(doc);
		expect(agg.getModel()).toBe(doc);
	});

	it("markUsed bumps lastUsedAt", () => {
		const agg = new SandboxAgg(makeSandbox({ lastUsedAt: 100 }));
		agg.markUsed(5_000);
		expect(agg.getModel().lastUsedAt).toBe(5_000);
	});

	it("markUsed rejects a destroyed sandbox", () => {
		const agg = new SandboxAgg(makeSandbox({ status: "destroyed", lastUsedAt: 100 }));
		expect(() => agg.markUsed(5_000)).toThrow(/destroyed/i);
		expect(agg.getModel().lastUsedAt).toBe(100);
	});

	it("markDestroyed flips status to 'destroyed'", () => {
		const agg = new SandboxAgg(makeSandbox({ status: "active" }));
		agg.markDestroyed();
		expect(agg.getModel().status).toBe("destroyed");
	});

	it("markStopped flips status to 'stopped'", () => {
		const agg = new SandboxAgg(makeSandbox({ status: "active" }));
		agg.markStopped();
		expect(agg.getModel().status).toBe("stopped");
	});

	it("markStopped rejects a destroyed sandbox", () => {
		const agg = new SandboxAgg(makeSandbox({ status: "destroyed" }));
		expect(() => agg.markStopped()).toThrow(/destroyed/i);
	});

	it("isExpired true when idle longer than maxIdleMs", () => {
		const agg = new SandboxAgg(makeSandbox({ lastUsedAt: 1_000 }));
		expect(agg.isExpired(5_000, 10_000)).toBe(true); // idle for 9_000ms > 5_000
	});

	it("isExpired false when still within the idle window", () => {
		const agg = new SandboxAgg(makeSandbox({ lastUsedAt: 1_000 }));
		expect(agg.isExpired(5_000, 4_000)).toBe(false); // idle for 3_000ms ≤ 5_000
	});

	it("isExpired false exactly at the boundary (> not >=)", () => {
		const agg = new SandboxAgg(makeSandbox({ lastUsedAt: 1_000 }));
		expect(agg.isExpired(5_000, 6_000)).toBe(false); // idle for exactly 5_000
		expect(agg.isExpired(5_000, 6_001)).toBe(true);
	});

	it("isExpired false for a destroyed sandbox regardless of age", () => {
		const agg = new SandboxAgg(makeSandbox({ status: "destroyed", lastUsedAt: 0 }));
		expect(agg.isExpired(1, 1_000_000)).toBe(false);
	});
});
