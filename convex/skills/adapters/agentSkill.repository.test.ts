import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import type { NewAgent } from "../../agents/domain/agent.model";
import { AgentSkillRepository } from "./agentSkill.repository";

const baseAgent: NewAgent = {
	orgId: "org_A",
	slug: "default",
	name: "Default",
	systemPrompt: "You are mom.",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
	isDefault: true,
	toolsAllowlist: [],
};

describe("M2-T03 AgentSkillRepository", () => {
	it("enable creates a binding when none exists", async () => {
		const t = newTest();
		const { agentId } = await t.run(async (ctx) => {
			const agent = await AgentRepository.create(ctx, baseAgent);
			return { agentId: agent.getModel()._id };
		});

		const enabled = await t.run(async (ctx) => {
			const agg = await AgentSkillRepository.enable(ctx, {
				orgId: "org_A",
				agentId,
				skillKey: "http.fetch",
			});
			return agg.getModel();
		});
		expect(enabled.skillKey).toBe("http.fetch");
		expect(enabled.enabled).toBe(true);
	});

	it("enable is idempotent (second call does not duplicate)", async () => {
		const t = newTest();
		const { agentId } = await t.run(async (ctx) => {
			const agent = await AgentRepository.create(ctx, baseAgent);
			return { agentId: agent.getModel()._id };
		});

		await t.run(async (ctx) => {
			await AgentSkillRepository.enable(ctx, { orgId: "org_A", agentId, skillKey: "http.fetch" });
			await AgentSkillRepository.enable(ctx, { orgId: "org_A", agentId, skillKey: "http.fetch" });
		});

		const keys = await t.run(async (ctx) => {
			const rows = await AgentSkillRepository.listForAgent(ctx, { agentId });
			return rows.map((r) => r.getModel().skillKey);
		});
		expect(keys).toEqual(["http.fetch"]);
	});

	it("enable re-activates a previously disabled binding and preserves config", async () => {
		const t = newTest();
		const { agentId } = await t.run(async (ctx) => {
			const agent = await AgentRepository.create(ctx, baseAgent);
			return { agentId: agent.getModel()._id };
		});

		await t.run(async (ctx) => {
			await AgentSkillRepository.enable(ctx, {
				orgId: "org_A",
				agentId,
				skillKey: "http.fetch",
				config: { maxRedirects: 3 },
			});
			await AgentSkillRepository.disable(ctx, { agentId, skillKey: "http.fetch" });
		});

		const reEnabled = await t.run(async (ctx) => {
			const agg = await AgentSkillRepository.enable(ctx, {
				orgId: "org_A",
				agentId,
				skillKey: "http.fetch",
			});
			return agg.getModel();
		});
		expect(reEnabled.enabled).toBe(true);
		expect(reEnabled.config).toEqual({ maxRedirects: 3 });
	});

	it("disable soft-removes the binding (enabled=false)", async () => {
		const t = newTest();
		const { agentId } = await t.run(async (ctx) => {
			const agent = await AgentRepository.create(ctx, baseAgent);
			return { agentId: agent.getModel()._id };
		});

		await t.run(async (ctx) => {
			await AgentSkillRepository.enable(ctx, { orgId: "org_A", agentId, skillKey: "http.fetch" });
			await AgentSkillRepository.disable(ctx, { agentId, skillKey: "http.fetch" });
		});

		const listed = await t.run(async (ctx) =>
			(await AgentSkillRepository.listForAgent(ctx, { agentId })).map((r) => r.getModel()),
		);
		expect(listed).toEqual([]);
	});

	it("disable is a no-op when no binding exists", async () => {
		const t = newTest();
		const { agentId } = await t.run(async (ctx) => {
			const agent = await AgentRepository.create(ctx, baseAgent);
			return { agentId: agent.getModel()._id };
		});

		await expect(
			t.run(async (ctx) => {
				await AgentSkillRepository.disable(ctx, { agentId, skillKey: "http.fetch" });
			}),
		).resolves.not.toThrow();
	});

	it("listForAgent returns only enabled bindings and does not leak across agents", async () => {
		const t = newTest();
		const { aId, bId } = await t.run(async (ctx) => {
			const a = await AgentRepository.create(ctx, { ...baseAgent, slug: "a", orgId: "org_A" });
			const b = await AgentRepository.create(ctx, {
				...baseAgent,
				slug: "b",
				orgId: "org_A",
				isDefault: false,
			});
			return { aId: a.getModel()._id, bId: b.getModel()._id };
		});

		await t.run(async (ctx) => {
			await AgentSkillRepository.enable(ctx, {
				orgId: "org_A",
				agentId: aId,
				skillKey: "http.fetch",
			});
			await AgentSkillRepository.enable(ctx, {
				orgId: "org_A",
				agentId: aId,
				skillKey: "memory.search",
			});
			await AgentSkillRepository.disable(ctx, { agentId: aId, skillKey: "memory.search" });
			await AgentSkillRepository.enable(ctx, {
				orgId: "org_A",
				agentId: bId,
				skillKey: "http.fetch",
			});
		});

		const aKeys = await t.run(async (ctx) =>
			(await AgentSkillRepository.listForAgent(ctx, { agentId: aId }))
				.map((r) => r.getModel().skillKey)
				.sort(),
		);
		expect(aKeys).toEqual(["http.fetch"]);
	});
});
