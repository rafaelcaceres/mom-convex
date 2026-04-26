import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { seedSkillCatalog } from "../../skills/_seeds";
import { tenants } from "../../tenants";

async function setupAgentWithOwner(t: ReturnType<typeof newTest>) {
	const ownerUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: ownerUserId });
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

async function addMember(t: ReturnType<typeof newTest>, ownerUserId: Id<"users">, orgId: string) {
	const userId = await t.run(async (ctx) => ctx.db.insert("users", {}));
	await t.run(async (ctx) => {
		await tenants.addMember(ctx, ownerUserId, orgId, userId, "member");
	});
	return { userId, caller: t.withIdentity({ subject: userId }) };
}

describe("setAgentModel mutation", () => {
	it("any org member can switch the agent's model", async () => {
		const t = newTest();
		const { ownerUserId, orgId, agentId } = await setupAgentWithOwner(t);
		const { caller: member } = await addMember(t, ownerUserId, orgId);

		await member.mutation(api.agents.mutations.setAgentModel.default, {
			agentId,
			modelId: "gemini-2.5-flash",
		});

		const agent = await t.run(async (ctx) => ctx.db.get(agentId));
		expect(agent?.modelId).toBe("gemini-2.5-flash");
		expect(agent?.modelProvider).toBe("google");
	});

	it("rejects unsupported model ids", async () => {
		const t = newTest();
		const { owner, agentId } = await setupAgentWithOwner(t);

		await expect(
			owner.mutation(api.agents.mutations.setAgentModel.default, {
				agentId,
				modelId: "gpt-fake-99",
			}),
		).rejects.toThrow(/unsupported model/i);
	});

	it("rejects unauthenticated callers", async () => {
		const t = newTest();
		const { agentId } = await setupAgentWithOwner(t);

		await expect(
			t.mutation(api.agents.mutations.setAgentModel.default, {
				agentId,
				modelId: "claude-opus-4-7",
			}),
		).rejects.toThrow(/Authentication required/);
	});

	it("rejects non-members of the agent's org", async () => {
		const t = newTest();
		const { agentId } = await setupAgentWithOwner(t);
		const otherUserId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const intruder = t.withIdentity({ subject: otherUserId });

		await expect(
			intruder.mutation(api.agents.mutations.setAgentModel.default, {
				agentId,
				modelId: "claude-opus-4-7",
			}),
		).rejects.toThrow(/Forbidden/);
	});
});
