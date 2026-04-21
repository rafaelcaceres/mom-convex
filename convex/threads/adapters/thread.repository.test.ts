import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { Id } from "../../_generated/dataModel";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import type { NewAgent } from "../../agents/domain/agent.model";
import { type AdapterBinding, type NewThread, bindingKey } from "../domain/thread.model";
import { ThreadRepository } from "./thread.repository";

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

async function seedAgent(
	t: ReturnType<typeof newTest>,
	overrides: Partial<NewAgent> = {},
): Promise<Id<"agents">> {
	return t.run(async (ctx) => {
		const agg = await AgentRepository.create(ctx, { ...baseAgent, ...overrides });
		return agg.getModel()._id;
	});
}

async function seedUser(t: ReturnType<typeof newTest>): Promise<Id<"users">> {
	return t.run(async (ctx) => ctx.db.insert("users", {}));
}

function makeNewThread(
	binding: AdapterBinding,
	agentId: Id<"agents">,
	overrides: Partial<NewThread> = {},
): NewThread {
	return {
		orgId: "org_A",
		agentId,
		agentThreadId: "placeholder",
		binding,
		bindingKey: bindingKey(binding),
		...overrides,
	};
}

describe("M1-T02 ThreadRepository", () => {
	it("create + getByOrgBinding round-trip (web binding)", async () => {
		const t = newTest();
		const agentId = await seedAgent(t);
		const userId = await seedUser(t);
		const binding = { type: "web" as const, userId };

		await t.run(async (ctx) => {
			await ThreadRepository.create(ctx, makeNewThread(binding, agentId));
		});

		const got = await t.run(async (ctx) => {
			const agg = await ThreadRepository.getByOrgBinding(ctx, {
				orgId: "org_A",
				bindingKey: bindingKey(binding),
			});
			return agg?.getModel() ?? null;
		});
		expect(got?.binding.type).toBe("web");
		if (got?.binding.type === "web") {
			expect(got.binding.userId).toBe(userId);
		}
	});

	it("getByOrgBinding scoped by org — same binding in 2 orgs returns distinct rows", async () => {
		const t = newTest();
		const agentA = await seedAgent(t, { orgId: "org_A" });
		const agentB = await seedAgent(t, { orgId: "org_B", isDefault: true });
		const binding: AdapterBinding = {
			type: "slack",
			installId: "si_1",
			channelId: "C1",
			threadTs: "1.1",
		};
		const sameKey = bindingKey(binding);

		await t.run(async (ctx) => {
			await ThreadRepository.create(ctx, makeNewThread(binding, agentA, { orgId: "org_A" }));
			await ThreadRepository.create(ctx, makeNewThread(binding, agentB, { orgId: "org_B" }));
		});

		const both = await t.run(async (ctx) => {
			const a = await ThreadRepository.getByOrgBinding(ctx, {
				orgId: "org_A",
				bindingKey: sameKey,
			});
			const b = await ThreadRepository.getByOrgBinding(ctx, {
				orgId: "org_B",
				bindingKey: sameKey,
			});
			return {
				a: a?.getModel().orgId,
				b: b?.getModel().orgId,
			};
		});
		expect(both).toEqual({ a: "org_A", b: "org_B" });
	});

	it("listByAgent returns only threads bound to the agent", async () => {
		const t = newTest();
		const agentA = await seedAgent(t);
		const agentB = await seedAgent(t, { slug: "support", isDefault: false });
		const users = await Promise.all([seedUser(t), seedUser(t), seedUser(t)]);

		await t.run(async (ctx) => {
			await ThreadRepository.create(ctx, makeNewThread({ type: "web", userId: users[0] }, agentA));
			await ThreadRepository.create(ctx, makeNewThread({ type: "web", userId: users[1] }, agentA));
			await ThreadRepository.create(ctx, makeNewThread({ type: "web", userId: users[2] }, agentB));
		});

		const rows = await t.run(async (ctx) => {
			const aggs = await ThreadRepository.listByAgent(ctx, { agentId: agentA });
			return aggs.map((a) => a.getModel().agentId);
		});
		expect(rows).toHaveLength(2);
		expect(rows.every((id) => id === agentA)).toBe(true);
	});
});
