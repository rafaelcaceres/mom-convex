import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import type { Id } from "../../_generated/dataModel";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import type { NewAgent } from "../../agents/domain/agent.model";
import { MemoryRepository } from "./memory.repository";

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

async function seedFixtures(t: ReturnType<typeof newTest>) {
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {});
		const agentA = await AgentRepository.create(ctx, { ...baseAgent, slug: "a" });
		const agentB = await AgentRepository.create(ctx, {
			...baseAgent,
			slug: "b",
			isDefault: false,
		});
		const threadId1 = await ctx.db.insert("threads", {
			orgId: "org_A",
			agentId: agentA.getModel()._id,
			agentThreadId: "pending:1",
			bindingKey: "web:u1",
			binding: { type: "web", userId },
		});
		const threadId2 = await ctx.db.insert("threads", {
			orgId: "org_A",
			agentId: agentA.getModel()._id,
			agentThreadId: "pending:2",
			bindingKey: "web:u2",
			binding: { type: "web", userId },
		});
		return {
			userId,
			agentAId: agentA.getModel()._id,
			agentBId: agentB.getModel()._id,
			threadId1,
			threadId2,
		};
	});
}

type Fixtures = Awaited<ReturnType<typeof seedFixtures>>;

async function insertMemory(
	t: ReturnType<typeof newTest>,
	fx: Fixtures,
	doc: {
		orgId: string;
		scope: "org" | "agent" | "thread";
		agentId?: Id<"agents">;
		threadId?: Id<"threads">;
		content: string;
		alwaysOn?: boolean;
	},
) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("memory", {
			orgId: doc.orgId,
			scope: doc.scope,
			agentId: doc.agentId,
			threadId: doc.threadId,
			content: doc.content,
			alwaysOn: doc.alwaysOn ?? false,
			updatedBy: fx.userId,
			updatedAt: Date.now(),
		});
	});
}

describe("M2-T07 MemoryRepository", () => {
	it("listForAgent returns org-scoped + matching agent-scoped rows", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);

		await insertMemory(t, fx, { orgId: "org_A", scope: "org", content: "org-wide fact" });
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "agent",
			agentId: fx.agentAId,
			content: "agent A persona",
		});
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "agent",
			agentId: fx.agentBId,
			content: "agent B persona",
		});
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "thread",
			agentId: fx.agentAId,
			threadId: fx.threadId1,
			content: "thread-only fact",
		});
		await insertMemory(t, fx, {
			orgId: "org_B",
			scope: "org",
			content: "other org fact",
		});

		const contents = await t.run(async (ctx) => {
			const rows = await MemoryRepository.listForAgent(ctx, {
				orgId: "org_A",
				agentId: fx.agentAId,
			});
			return rows.map((r) => r.getModel().content).sort();
		});
		expect(contents).toEqual(["agent A persona", "org-wide fact"]);
	});

	it("listForThread includes thread-scoped + agent + org, filtered by thread id", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);

		await insertMemory(t, fx, { orgId: "org_A", scope: "org", content: "org fact" });
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "agent",
			agentId: fx.agentAId,
			content: "agent fact",
		});
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "thread",
			agentId: fx.agentAId,
			threadId: fx.threadId1,
			content: "thread1 fact",
		});
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "thread",
			agentId: fx.agentAId,
			threadId: fx.threadId2,
			content: "thread2 fact",
		});

		const contents = await t.run(async (ctx) => {
			const rows = await MemoryRepository.listForThread(ctx, {
				orgId: "org_A",
				agentId: fx.agentAId,
				threadId: fx.threadId1,
			});
			return rows.map((r) => r.getModel().content).sort();
		});
		expect(contents).toEqual(["agent fact", "org fact", "thread1 fact"]);
	});

	it("listAlwaysOn filters to alwaysOn=true rows within the thread visibility set", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);

		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "org",
			content: "always-on org",
			alwaysOn: true,
		});
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "org",
			content: "ephemeral org",
			alwaysOn: false,
		});
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "agent",
			agentId: fx.agentAId,
			content: "always-on agent",
			alwaysOn: true,
		});
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "thread",
			agentId: fx.agentAId,
			threadId: fx.threadId1,
			content: "always-on thread1",
			alwaysOn: true,
		});
		await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "thread",
			agentId: fx.agentAId,
			threadId: fx.threadId2,
			content: "always-on thread2",
			alwaysOn: true,
		});

		const contents = await t.run(async (ctx) => {
			const rows = await MemoryRepository.listAlwaysOn(ctx, {
				orgId: "org_A",
				agentId: fx.agentAId,
				threadId: fx.threadId1,
			});
			return rows.map((r) => r.getModel().content).sort();
		});
		expect(contents).toEqual(["always-on agent", "always-on org", "always-on thread1"]);
	});

	it("listForAgent does not leak across orgs", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);

		await insertMemory(t, fx, { orgId: "org_A", scope: "org", content: "a" });
		await insertMemory(t, fx, { orgId: "org_B", scope: "org", content: "b" });

		const contents = await t.run(async (ctx) => {
			const rows = await MemoryRepository.listForAgent(ctx, {
				orgId: "org_B",
				agentId: fx.agentAId,
			});
			return rows.map((r) => r.getModel().content);
		});
		expect(contents).toEqual(["b"]);
	});

	it("save round-trips aggregate mutations", async () => {
		const t = newTest();
		const fx = await seedFixtures(t);
		const id = await insertMemory(t, fx, {
			orgId: "org_A",
			scope: "org",
			content: "old",
		});

		await t.run(async (ctx) => {
			const agg = await MemoryRepository.get(ctx, id);
			if (!agg) throw new Error("expected memory");
			agg.updateContent("new content");
			agg.setAlwaysOn(true);
			agg.touch(fx.userId, 9999);
			await MemoryRepository.save(ctx, agg);
		});

		const reloaded = await t.run(async (ctx) => {
			const agg = await MemoryRepository.get(ctx, id);
			return agg?.getModel() ?? null;
		});
		expect(reloaded?.content).toBe("new content");
		expect(reloaded?.alwaysOn).toBe(true);
		expect(reloaded?.updatedAt).toBe(9999);
	});
});
