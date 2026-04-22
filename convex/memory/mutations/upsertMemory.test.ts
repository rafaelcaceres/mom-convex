import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { tenants } from "../../tenants";

async function setupOrg(t: ReturnType<typeof newTest>) {
	const ownerUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: ownerUserId });
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: "Acme",
	});
	const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;
	const threadId = await t.run(async (ctx) =>
		ctx.db.insert("threads", {
			orgId,
			agentId,
			agentThreadId: "pending:x",
			bindingKey: `web:${ownerUserId}`,
			binding: { type: "web", userId: ownerUserId },
		}),
	);
	return { owner, ownerUserId, orgId, agentId, threadId };
}

async function addMember(
	t: ReturnType<typeof newTest>,
	ownerUserId: Id<"users">,
	orgId: string,
	role: "admin" | "member" = "member",
) {
	const memberUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	await t.run(async (ctx) => {
		await tenants.addMember(ctx, ownerUserId, orgId, memberUserId, role);
	});
	return { memberUserId, member: t.withIdentity({ subject: memberUserId }) };
}

describe("M2-T07 upsertMemory mutation", () => {
	it("rejects unauthenticated callers", async () => {
		const t = newTest();
		const { orgId } = await setupOrg(t);
		await expect(
			t.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "org",
				content: "test",
			}),
		).rejects.toThrow(/authentication required/i);
	});

	it("org-scope requires admin — member is forbidden", async () => {
		const t = newTest();
		const { ownerUserId, orgId } = await setupOrg(t);
		const { member } = await addMember(t, ownerUserId, orgId, "member");
		await expect(
			member.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "org",
				content: "no-go",
			}),
		).rejects.toThrow(/forbidden/i);
	});

	it("org-scope accepts owner/admin and persists content + alwaysOn default", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);
		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "pi day is march 14",
		});
		const doc = await t.run(async (ctx) => ctx.db.get(id));
		expect(doc?.content).toBe("pi day is march 14");
		expect(doc?.alwaysOn).toBe(false);
		expect(doc?.scope).toBe("org");
	});

	it("thread-scope accepts member role", async () => {
		const t = newTest();
		const { ownerUserId, orgId, agentId, threadId } = await setupOrg(t);
		const { member } = await addMember(t, ownerUserId, orgId, "member");
		const id = await member.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "thread",
			agentId,
			threadId,
			content: "user prefers metric units",
			alwaysOn: true,
		});
		const doc = await t.run(async (ctx) => ctx.db.get(id));
		expect(doc?.alwaysOn).toBe(true);
		expect(doc?.scope).toBe("thread");
	});

	it("rejects content over 8000 chars", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);
		const tooLong = "x".repeat(8001);
		await expect(
			owner.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "org",
				content: tooLong,
			}),
		).rejects.toThrow(/exceeds/i);
	});

	it("rejects empty / whitespace-only content", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);
		await expect(
			owner.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "org",
				content: "   ",
			}),
		).rejects.toThrow(/empty/i);
	});

	it("org-scope rejects agentId/threadId args", async () => {
		const t = newTest();
		const { owner, orgId, agentId } = await setupOrg(t);
		await expect(
			owner.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "org",
				agentId,
				content: "bad",
			}),
		).rejects.toThrow(/must not set agentId/i);
	});

	it("agent-scope requires agentId belonging to the org", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);
		await expect(
			owner.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "agent",
				content: "no agentId",
			}),
		).rejects.toThrow(/requires agentId/i);

		// An agent id that exists but in a *different* org should be rejected.
		const otherUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const otherOwner = t.withIdentity({ subject: otherUserId });
		const { orgId: otherOrgId } = await otherOwner.mutation(
			api.tenancy.mutations.completeOnboarding.default,
			{ orgName: "Other" },
		);
		const otherAgents = await otherOwner.query(api.agents.queries.listByOrg.default, {
			orgId: otherOrgId,
		});
		const otherAgentId = otherAgents[0]?._id as Id<"agents">;
		await expect(
			owner.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "agent",
				agentId: otherAgentId,
				content: "cross-tenant",
			}),
		).rejects.toThrow(/agent not found/i);
	});

	it("thread-scope rejects threads that belong to another agent", async () => {
		const t = newTest();
		const { owner, ownerUserId, orgId, threadId } = await setupOrg(t);
		// Create a second agent in the same org; thread belongs to the first.
		const otherAgentId = await owner.mutation(api.agents.mutations.createAgent.default, {
			orgId,
			slug: "other",
			name: "Other",
			systemPrompt: "x",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
		});
		void ownerUserId;
		await expect(
			owner.mutation(api.memory.mutations.upsertMemory.default, {
				orgId,
				scope: "thread",
				agentId: otherAgentId,
				threadId,
				content: "mismatched",
			}),
		).rejects.toThrow(/thread does not belong to agent/i);
	});

	it("update path patches content + alwaysOn, locks scope + orgId", async () => {
		const t = newTest();
		const { owner, orgId, agentId } = await setupOrg(t);
		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "v1",
		});
		await owner.mutation(api.memory.mutations.upsertMemory.default, {
			id,
			orgId,
			scope: "org",
			content: "v2",
			alwaysOn: true,
		});
		const doc = await t.run(async (ctx) => ctx.db.get(id));
		expect(doc?.content).toBe("v2");
		expect(doc?.alwaysOn).toBe(true);

		// Changing scope on update is refused even when the new-scope args are
		// well-formed (agent-scoped + agentId in the same org).
		await expect(
			owner.mutation(api.memory.mutations.upsertMemory.default, {
				id,
				orgId,
				scope: "agent",
				agentId,
				content: "v3",
			}),
		).rejects.toThrow(/cannot change scope/i);
	});
});
