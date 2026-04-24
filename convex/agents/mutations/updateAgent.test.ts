import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { seedSkillCatalog } from "../../skills/_seeds";
import { tenants } from "../../tenants";

/**
 * Covers the four acceptance cases from M2-T17 at the backend level. The
 * UI assembles these mutations, but the invariants they protect (auth,
 * prompt propagation, skill toggle, memory visibility) live at this layer.
 */

async function setupAgentWithOwner(t: ReturnType<typeof newTest>) {
	const ownerUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: ownerUserId });
	// Seed catalog BEFORE onboarding so the baseline-skills trigger populates.
	await t.run(async (ctx) => {
		await seedSkillCatalog(ctx);
	});
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: "Acme",
	});
	const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;
	return { owner, ownerUserId, orgId, agentId };
}

async function addMember(
	t: ReturnType<typeof newTest>,
	ownerUserId: Id<"users">,
	orgId: string,
	role: "admin" | "member",
) {
	const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	await t.run(async (ctx) => {
		await tenants.addMember(ctx, ownerUserId, orgId, userId, role);
	});
	return { userId, caller: t.withIdentity({ subject: userId }) };
}

describe("M2-T17 updateAgent mutation", () => {
	it("editing systemPrompt persists so the next turn sees the new prompt", async () => {
		const t = newTest();
		const { owner, agentId } = await setupAgentWithOwner(t);

		await owner.mutation(api.agents.mutations.updateAgent.default, {
			agentId,
			systemPrompt: "You are a meticulous ops assistant.",
		});

		const agent = await t.run(async (ctx) => ctx.db.get(agentId));
		expect(agent?.systemPrompt).toBe("You are a meticulous ops assistant.");
	});

	it("switching modelId updates provider consistently and rejects unknown models", async () => {
		const t = newTest();
		const { owner, agentId } = await setupAgentWithOwner(t);

		await owner.mutation(api.agents.mutations.updateAgent.default, {
			agentId,
			modelId: "claude-opus-4-7",
		});
		const agent = await t.run(async (ctx) => ctx.db.get(agentId));
		expect(agent?.modelId).toBe("claude-opus-4-7");
		expect(agent?.modelProvider).toBe("anthropic");

		await expect(
			owner.mutation(api.agents.mutations.updateAgent.default, {
				agentId,
				modelId: "gpt-legacy-42",
			}),
		).rejects.toThrow(/unsupported model/i);
	});

	it("toggling a skill off drops it from resolveTools so the agent can't call it", async () => {
		const t = newTest();
		const { owner, agentId } = await setupAgentWithOwner(t);

		// Enable sandbox.bash first, then disable it — the baseline trigger only
		// enables http.fetch + memory.search, so we exercise the full on→off loop.
		await owner.mutation(api.skills.mutations.toggleSkill.default, {
			agentId,
			skillKey: "sandbox.bash",
			action: "enable",
		});
		const enabled = await t.run(async (ctx) =>
			ctx.runQuery(internal.skills.queries.listResolvedForAgentInternal.default, { agentId }),
		);
		expect(enabled.map((r) => r.skillKey)).toContain("sandbox.bash");

		await owner.mutation(api.skills.mutations.toggleSkill.default, {
			agentId,
			skillKey: "sandbox.bash",
			action: "disable",
		});
		const after = await t.run(async (ctx) =>
			ctx.runQuery(internal.skills.queries.listResolvedForAgentInternal.default, { agentId }),
		);
		expect(after.map((r) => r.skillKey)).not.toContain("sandbox.bash");
	});

	it("alwaysOn memory surfaces in the agent's memory list for the next turn", async () => {
		const t = newTest();
		const { owner, orgId, agentId, ownerUserId } = await setupAgentWithOwner(t);

		await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "agent",
			agentId,
			content: "Internal project code-name is Zephyr.",
			alwaysOn: true,
		});

		// Insert a thread to exercise the same `listAlwaysOn` code path the
		// system-prompt builder uses at turn time.
		const threadId = await t.run(async (ctx) =>
			ctx.db.insert("threads", {
				orgId,
				agentId,
				agentThreadId: "pending:x",
				bindingKey: `web:${ownerUserId}`,
				binding: { type: "web", userId: ownerUserId },
			}),
		);
		const rows = await t.run(async (ctx) =>
			ctx.runQuery(internal.memory.queries.listAlwaysOnInternal.default, {
				orgId,
				agentId,
				threadId,
			}),
		);
		expect(rows.map((r) => r.content)).toContain("Internal project code-name is Zephyr.");
	});

	it("non-admin members cannot edit (forbidden)", async () => {
		const t = newTest();
		const { ownerUserId, orgId, agentId } = await setupAgentWithOwner(t);
		const { caller: member } = await addMember(t, ownerUserId, orgId, "member");

		await expect(
			member.mutation(api.agents.mutations.updateAgent.default, {
				agentId,
				systemPrompt: "hijack attempt",
			}),
		).rejects.toThrow(/forbidden/i);

		await expect(
			member.mutation(api.skills.mutations.toggleSkill.default, {
				agentId,
				skillKey: "sandbox.bash",
				action: "enable",
			}),
		).rejects.toThrow(/forbidden/i);

		await expect(
			member.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "agent",
				agentId,
				content: "rogue memory",
			}),
		).rejects.toThrow(/forbidden/i);
	});

	it("unauthenticated callers are rejected", async () => {
		const t = newTest();
		const { agentId } = await setupAgentWithOwner(t);
		await expect(
			t.mutation(api.agents.mutations.updateAgent.default, {
				agentId,
				systemPrompt: "nope",
			}),
		).rejects.toThrow(/authentication required/i);
	});

	it("rejects empty systemPrompt", async () => {
		const t = newTest();
		const { owner, agentId } = await setupAgentWithOwner(t);
		await expect(
			owner.mutation(api.agents.mutations.updateAgent.default, {
				agentId,
				systemPrompt: "   ",
			}),
		).rejects.toThrow(/empty/i);
	});
});
