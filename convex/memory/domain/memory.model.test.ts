import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { MAX_MEMORY_CONTENT_CHARS, type Memory, MemoryAgg } from "./memory.model";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
	return {
		_id: "memory:1" as unknown as Id<"memory">,
		_creationTime: Date.now(),
		orgId: "org_A",
		scope: "org",
		content: "pi day is march 14",
		alwaysOn: false,
		updatedBy: "users:u1" as unknown as Id<"users">,
		updatedAt: Date.now(),
		...overrides,
	};
}

describe("M2-T07 MemoryAgg", () => {
	it("getModel returns the underlying doc", () => {
		const doc = makeMemory();
		const agg = new MemoryAgg(doc);
		expect(agg.getModel()).toBe(doc);
	});

	it("matchesScope is true for org-scoped memories regardless of ctx", () => {
		const agg = new MemoryAgg(makeMemory({ scope: "org" }));
		expect(agg.matchesScope({})).toBe(true);
		expect(
			agg.matchesScope({
				agentId: "agents:anything" as unknown as Id<"agents">,
				threadId: "threads:anything" as unknown as Id<"threads">,
			}),
		).toBe(true);
	});

	it("matchesScope true when agent-scoped memory's agentId matches ctx", () => {
		const agentId = "agents:a1" as unknown as Id<"agents">;
		const agg = new MemoryAgg(makeMemory({ scope: "agent", agentId }));
		expect(agg.matchesScope({ agentId })).toBe(true);
	});

	it("matchesScope false when agent-scoped memory's agentId differs from ctx", () => {
		const agg = new MemoryAgg(
			makeMemory({ scope: "agent", agentId: "agents:a1" as unknown as Id<"agents"> }),
		);
		expect(agg.matchesScope({ agentId: "agents:a2" as unknown as Id<"agents"> })).toBe(false);
		expect(agg.matchesScope({})).toBe(false);
	});

	it("matchesScope true when thread-scoped memory's threadId matches ctx", () => {
		const threadId = "threads:t1" as unknown as Id<"threads">;
		const agg = new MemoryAgg(makeMemory({ scope: "thread", threadId }));
		expect(agg.matchesScope({ threadId })).toBe(true);
	});

	it("matchesScope false when thread-scoped memory's threadId differs from ctx", () => {
		const agg = new MemoryAgg(
			makeMemory({ scope: "thread", threadId: "threads:t1" as unknown as Id<"threads"> }),
		);
		expect(agg.matchesScope({ threadId: "threads:t2" as unknown as Id<"threads"> })).toBe(false);
		expect(agg.matchesScope({})).toBe(false);
	});

	it("alwaysOn round-trips through setAlwaysOn (default false)", () => {
		const agg = new MemoryAgg(makeMemory());
		expect(agg.getModel().alwaysOn).toBe(false);
		agg.setAlwaysOn(true);
		expect(agg.getModel().alwaysOn).toBe(true);
		agg.setAlwaysOn(false);
		expect(agg.getModel().alwaysOn).toBe(false);
	});

	it("updateContent trims and replaces the content", () => {
		const agg = new MemoryAgg(makeMemory({ content: "old" }));
		agg.updateContent("  new  ");
		expect(agg.getModel().content).toBe("new");
	});

	it("updateContent rejects empty / whitespace-only input", () => {
		const agg = new MemoryAgg(makeMemory());
		expect(() => agg.updateContent("")).toThrow(/empty/i);
		expect(() => agg.updateContent("   ")).toThrow(/empty/i);
	});

	it("updateContent rejects content over MAX_MEMORY_CONTENT_CHARS", () => {
		const agg = new MemoryAgg(makeMemory());
		const tooLong = "x".repeat(MAX_MEMORY_CONTENT_CHARS + 1);
		expect(() => agg.updateContent(tooLong)).toThrow(/exceeds/i);
	});

	it("touch updates updatedBy and updatedAt", () => {
		const original = makeMemory({ updatedAt: 0 });
		const agg = new MemoryAgg(original);
		agg.touch("users:u2" as unknown as Id<"users">, 1234);
		expect(agg.getModel().updatedBy).toBe("users:u2");
		expect(agg.getModel().updatedAt).toBe(1234);
	});
});
