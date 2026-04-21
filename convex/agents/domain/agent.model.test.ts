import { describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { type Agent, AgentAgg } from "./agent.model";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
	return {
		_id: "agents:1" as unknown as Id<"agents">,
		_creationTime: Date.now(),
		orgId: "org_abc",
		slug: "default",
		name: "Default Agent",
		systemPrompt: "You are mom.",
		modelId: "claude-sonnet-4-5",
		modelProvider: "anthropic",
		isDefault: true,
		toolsAllowlist: [],
		...overrides,
	};
}

describe("M1-T01 AgentAgg", () => {
	it("getModel returns the underlying doc", () => {
		const agent = makeAgent();
		const agg = new AgentAgg(agent);
		expect(agg.getModel()).toBe(agent);
	});

	it("markAsDefault flips isDefault to true", () => {
		const agent = makeAgent({ isDefault: false });
		const agg = new AgentAgg(agent);
		agg.markAsDefault();
		expect(agg.getModel().isDefault).toBe(true);
	});

	it("markAsDefault on an already-default agent is a no-op", () => {
		const agent = makeAgent({ isDefault: true });
		const agg = new AgentAgg(agent);
		agg.markAsDefault();
		expect(agg.getModel().isDefault).toBe(true);
	});

	it("unmarkDefault flips isDefault to false", () => {
		const agent = makeAgent({ isDefault: true });
		const agg = new AgentAgg(agent);
		agg.unmarkDefault();
		expect(agg.getModel().isDefault).toBe(false);
	});

	it("updateSystemPrompt replaces the prompt", () => {
		const agent = makeAgent({ systemPrompt: "old" });
		const agg = new AgentAgg(agent);
		agg.updateSystemPrompt("new prompt");
		expect(agg.getModel().systemPrompt).toBe("new prompt");
	});

	it("updateSystemPrompt rejects empty string", () => {
		const agg = new AgentAgg(makeAgent());
		expect(() => agg.updateSystemPrompt("")).toThrow(/empty/i);
	});
});
