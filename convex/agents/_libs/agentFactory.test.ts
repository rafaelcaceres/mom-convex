import { Agent } from "@convex-dev/agent";
import { beforeEach, describe, expect, it } from "vitest";
import { _clearAgentCache, getAgent } from "./agentFactory";

const base = {
	orgId: "org_A",
	agentId: "a1",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
	name: "Default",
	systemPrompt: "You are mom.",
	toolsAllowlist: [] as string[],
};

describe("M2-T01 agentFactory", () => {
	beforeEach(() => _clearAgentCache());

	it("returns an Agent instance from @convex-dev/agent", () => {
		const a = getAgent(base);
		expect(a).toBeInstanceOf(Agent);
	});

	it("cache hit: two calls with same key return the same instance", () => {
		const a1 = getAgent(base);
		const a2 = getAgent(base);
		expect(a1).toBe(a2);
	});

	it("different modelId → cache invalidated, new instance", () => {
		const a1 = getAgent(base);
		const a2 = getAgent({ ...base, modelId: "claude-opus-4-1" });
		expect(a1).not.toBe(a2);
	});

	it("different agentId (same org) → different instance", () => {
		const a1 = getAgent(base);
		const a2 = getAgent({ ...base, agentId: "a2" });
		expect(a1).not.toBe(a2);
	});

	it("different orgId → different instance", () => {
		const a1 = getAgent(base);
		const a2 = getAgent({ ...base, orgId: "org_B" });
		expect(a1).not.toBe(a2);
	});

	it("unsupported provider throws (only anthropic supported in M2-T01)", () => {
		expect(() => getAgent({ ...base, modelProvider: "openai" })).toThrow(/provider/i);
	});

	it("anthropic provider produces a model whose provider reflects anthropic", () => {
		const a = getAgent(base);
		const model = a.options.languageModel as { provider?: string } | undefined;
		expect(model?.provider).toMatch(/anthropic/i);
	});
});
