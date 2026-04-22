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

async function addMember(t: ReturnType<typeof newTest>, ownerUserId: Id<"users">, orgId: string) {
	const memberUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	await t.run(async (ctx) => {
		await tenants.addMember(ctx, ownerUserId, orgId, memberUserId, "member");
	});
	return { memberUserId, member: t.withIdentity({ subject: memberUserId }) };
}

describe("M2-T07 deleteMemory mutation", () => {
	it("deletes an org-scoped memory when caller is admin+", async () => {
		const t = newTest();
		const { owner, orgId } = await setupOrg(t);
		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "delete me",
		});
		await owner.mutation(api.memory.mutations.deleteMemory.default, { id });
		const doc = await t.run(async (ctx) => ctx.db.get(id));
		expect(doc).toBeNull();
	});

	it("rejects member deleting an org-scoped memory", async () => {
		const t = newTest();
		const { owner, ownerUserId, orgId } = await setupOrg(t);
		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "delete me",
		});
		const { member } = await addMember(t, ownerUserId, orgId);
		await expect(
			member.mutation(api.memory.mutations.deleteMemory.default, { id }),
		).rejects.toThrow(/forbidden/i);
	});

	it("allows member to delete a thread-scoped memory", async () => {
		const t = newTest();
		const { owner, ownerUserId, orgId, agentId, threadId } = await setupOrg(t);
		const id = await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "thread",
			agentId,
			threadId,
			content: "scratch",
		});
		const { member } = await addMember(t, ownerUserId, orgId);
		await member.mutation(api.memory.mutations.deleteMemory.default, { id });
		const doc = await t.run(async (ctx) => ctx.db.get(id));
		expect(doc).toBeNull();
	});

	it("throws when the memory id does not exist", async () => {
		const t = newTest();
		const { owner } = await setupOrg(t);
		const fakeId = "memory:nonexistent" as unknown as Id<"memory">;
		await expect(
			owner.mutation(api.memory.mutations.deleteMemory.default, { id: fakeId }),
		).rejects.toThrow();
	});
});
