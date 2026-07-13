import { saveMessage } from "@convex-dev/agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import {
	bagOfWordsEmbedding,
	bagOfWordsEmbeddingModel,
	mockEmbeddingModel,
} from "../../../test/_helpers/embedding";
import { api, components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { AgentRepository } from "../../agents/adapters/agent.repository";
import { createAgentThread } from "../../agents/adapters/threadBridge";
import { _setEmbeddingModelOverride } from "../../memory/_libs/embedding";
import { seedSkillCatalog } from "../_seeds";
import type { MemorySearchResult } from "./memorySearch";

/**
 * M3-T04 — `memory.search` over the real vector index, driven through the real
 * dispatcher (`skills.actions.invoke`), because what can go wrong lives *between*
 * the pieces: the index filters on `orgId` and nothing finer, so every other
 * boundary — another agent's memories, another Slack channel's — is enforced
 * during hydration, and a unit test of the impl alone would never reach it.
 *
 * Embeddings come from a bag-of-words mock, where cosine similarity is word
 * overlap. Crude, but it has the one property the assertions rest on: a related
 * row scores above `MIN_SCORE`, an unrelated one scores exactly 0.
 *
 * Rows are seeded with their vector already attached, because that is what "in
 * the index" means — and because `t.run` writes through raw `ctx.db`, which the
 * M3-T02 trigger never sees. The write→embed→search loop is covered end-to-end
 * separately, through the real mutation.
 *
 * Harness note: convex-test scores *every* row in the filtered partition, so a
 * same-org row with no `embedding` would crash its cosine computation. Real
 * Convex just leaves unembedded rows out of the index (M3-T02's
 * eventual-consistency window). Any fixture in the org under test therefore
 * needs a vector.
 */

async function setup(t: ReturnType<typeof newTest>) {
	await t.run(async (ctx) => {
		await seedSkillCatalog(ctx);
	});
	const userId = await t.run((ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: userId });
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: "Acme",
	});
	const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;
	return { owner, userId, orgId, agentId };
}

/**
 * A Slack thread with a *real* agent-component thread behind it. The component
 * validates `agentThreadId` as one of its own ids, so a placeholder string turns
 * every default-scope (`"all"`) search into a validator error — production
 * threads always carry a real one by the time a tool can run.
 */
async function slackThread(
	t: ReturnType<typeof newTest>,
	clause: { orgId: string; agentId: Id<"agents">; channelId: string; threadTs: string },
) {
	const agentThreadId = await t.run((ctx) => createAgentThread(ctx, { title: clause.channelId }));
	const threadId = await t.run((ctx) =>
		ctx.db.insert("threads", {
			orgId: clause.orgId,
			agentId: clause.agentId,
			agentThreadId,
			bindingKey: `slack:inst_1:${clause.channelId}:${clause.threadTs}`,
			binding: {
				type: "slack",
				installId: "inst_1",
				channelId: clause.channelId,
				threadTs: clause.threadTs,
			},
		}),
	);
	return { threadId, agentThreadId };
}

/** A memory row as the index sees it: content plus the vector for that content. */
async function seedMemory(
	t: ReturnType<typeof newTest>,
	userId: Id<"users">,
	doc: {
		orgId: string;
		scope: "org" | "agent" | "channel" | "thread";
		content: string;
		alwaysOn?: boolean;
		agentId?: Id<"agents">;
		threadId?: Id<"threads">;
		channelKey?: string;
	},
) {
	return t.run((ctx) =>
		ctx.db.insert("memory", {
			orgId: doc.orgId,
			scope: doc.scope,
			agentId: doc.agentId,
			threadId: doc.threadId,
			channelKey: doc.channelKey,
			content: doc.content,
			alwaysOn: doc.alwaysOn ?? false,
			updatedBy: userId,
			updatedAt: Date.now(),
			embedding: bagOfWordsEmbedding(doc.content),
		}),
	);
}

type Scope = {
	orgId: string;
	agentId: Id<"agents">;
	threadId: Id<"threads">;
	agentThreadId: string;
};

function invokeSearch(t: ReturnType<typeof newTest>, scope: Scope, args: Record<string, unknown>) {
	return t.action(internal.skills.actions.invoke.default, {
		skillKey: "memory.search",
		args,
		scope: { ...scope, userId: null },
		toolCallId: "tc_search",
	}) as Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>;
}

/** The dispatcher hands the model an MCP-ish envelope of JSON text; unwrap it. */
async function searchResult(
	t: ReturnType<typeof newTest>,
	scope: Scope,
	args: Record<string, unknown>,
): Promise<MemorySearchResult> {
	const raw = await invokeSearch(t, scope, args);
	expect(raw.isError).not.toBe(true);
	return JSON.parse(raw.content[0]?.text ?? "{}") as MemorySearchResult;
}

describe("M3-T04 memory.search — semantic retrieval", () => {
	beforeEach(() => {
		_setEmbeddingModelOverride(bagOfWordsEmbeddingModel());
	});

	afterEach(() => {
		// Restore the global default rather than clearing it: late scheduled embed
		// jobs from other suites would otherwise reach for the real provider.
		_setEmbeddingModelOverride(mockEmbeddingModel());
	});

	it("finds a memory by meaning, not by substring — and leaves the unrelated one behind", async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const { threadId, agentThreadId } = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		await seedMemory(t, userId, { orgId, scope: "org", content: "prefers python for data work" });
		await seedMemory(t, userId, { orgId, scope: "org", content: "deploys go out on fridays" });

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "python" },
		);

		expect(result.memories.map((m) => m.content)).toEqual(["prefers python for data work"]);
		expect(result.memories[0]?.score).toBeGreaterThan(0.2);
	});

	it("retrieves a memory that is NOT alwaysOn — the rows that exist only to be searched", async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const { threadId, agentThreadId } = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		await seedMemory(t, userId, {
			orgId,
			scope: "org",
			content: "the staging database password rotates monthly",
			alwaysOn: false,
		});

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "database" },
		);

		expect(result.memories.map((m) => m.content)).toEqual([
			"the staging database password rotates monthly",
		]);
		expect(result.memories[0]?.alwaysOn).toBe(false);
	});

	it("does not leak across orgs, even for an identical query", async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const { threadId, agentThreadId } = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		await seedMemory(t, userId, { orgId, scope: "org", content: "acme uses python" });
		await seedMemory(t, userId, {
			orgId: "org_OTHER",
			scope: "org",
			content: "initech uses python",
		});

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "python" },
		);

		expect(result.memories.map((m) => m.content)).toEqual(["acme uses python"]);
	});

	it("does not leak across channels — #sales cannot retrieve what was learned in #eng", async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const eng = await slackThread(t, { orgId, agentId, channelId: "C_ENG", threadTs: "1.1" });
		const sales = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_SALES",
			threadTs: "1.1",
		});

		// Same org, so the index's only filter lets this row through to both turns.
		// Scope is what keeps it out of #sales — which is exactly why hydration
		// re-checks it instead of trusting the index.
		await seedMemory(t, userId, {
			orgId,
			scope: "channel",
			channelKey: "slack:inst_1:C_ENG",
			content: "the python service owner is on call",
		});

		const inEng = await searchResult(t, { orgId, agentId, ...eng }, { query: "python" });
		const inSales = await searchResult(t, { orgId, agentId, ...sales }, { query: "python" });

		expect(inEng.memories.map((m) => m.content)).toEqual(["the python service owner is on call"]);
		expect(inSales.memories).toEqual([]);
	});

	it("does not surface another agent's memories", async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const otherAgentId = await t.run(async (ctx) => {
			const agg = await AgentRepository.create(ctx, {
				orgId,
				slug: "sidekick",
				name: "Sidekick",
				systemPrompt: "You are a sidekick.",
				modelId: "claude-sonnet-4-5",
				modelProvider: "anthropic",
				isDefault: false,
				toolsAllowlist: [],
			});
			return agg.getModel()._id;
		});
		const { threadId, agentThreadId } = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		await seedMemory(t, userId, {
			orgId,
			scope: "agent",
			agentId: otherAgentId,
			content: "python is the sidekick persona language",
		});

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "python" },
		);

		expect(result.memories).toEqual([]);
	});

	it("caps memory hits at the requested limit", async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const { threadId, agentThreadId } = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		for (let i = 0; i < 5; i++) {
			await seedMemory(t, userId, { orgId, scope: "org", content: `python note ${i}` });
		}

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "python", limit: 2 },
		);

		expect(result.memories).toHaveLength(2);
	});

	it("returns nothing when the org has memories but none are related", async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const { threadId, agentThreadId } = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		await seedMemory(t, userId, { orgId, scope: "org", content: "lunch is at noon" });

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "kubernetes" },
		);

		// Vector search always hands back its top-K. MIN_SCORE is what stops an
		// unrelated lunch preference from being served as context about clusters.
		expect(result.memories).toEqual([]);
	});

	it("empty query is rejected instead of embedding whitespace", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const { threadId, agentThreadId } = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		const raw = await invokeSearch(t, { orgId, agentId, threadId, agentThreadId }, { query: "" });

		expect(raw.isError).toBe(true);
	});
});

describe("M3-T04 memory.search — write, embed, retrieve", () => {
	beforeEach(() => {
		// Fake timers with a deliberately narrow `toFake`: faking nextTick /
		// queueMicrotask stalls convex-test's own async I/O and surfaces as bogus
		// "Transaction not started" errors from inside the scheduled action.
		vi.useFakeTimers({
			toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
		});
		_setEmbeddingModelOverride(bagOfWordsEmbeddingModel());
	});

	afterEach(() => {
		vi.useRealTimers();
		_setEmbeddingModelOverride(mockEmbeddingModel());
	});

	it("a memory written through the mutation becomes retrievable once its embed job runs", async () => {
		const t = newTest();
		const { owner, orgId, agentId } = await setup(t);
		const { threadId, agentThreadId } = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		await owner.mutation(api.memory.mutations.upsertMemory.default, {
			orgId,
			scope: "org",
			content: "the incident retro doc lives in notion",
			alwaysOn: false,
		});

		// Before the trigger's job runs the row exists but has no vector, so it is
		// not in the index — the eventual-consistency window M3-T02 bought on
		// purpose. This is the whole loop closing: write → embed → retrieve.
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "retro" },
		);

		expect(result.memories.map((m) => m.content)).toEqual([
			"the incident retro doc lives in notion",
		]);
	});
});

describe("M3-T04 memory.search — history + scope routing", () => {
	beforeEach(() => {
		_setEmbeddingModelOverride(bagOfWordsEmbeddingModel());
	});

	afterEach(() => {
		_setEmbeddingModelOverride(mockEmbeddingModel());
	});

	async function threadWithHistory(
		t: ReturnType<typeof newTest>,
		orgId: string,
		agentId: Id<"agents">,
	) {
		const agentThreadId = await t.run((ctx) => createAgentThread(ctx, { title: "hist" }));
		const threadId = await t.run((ctx) =>
			ctx.db.insert("threads", {
				orgId,
				agentId,
				agentThreadId,
				bindingKey: "slack:inst_1:C_ENG:9.9",
				binding: { type: "slack", installId: "inst_1", channelId: "C_ENG", threadTs: "9.9" },
			}),
		);
		await t.run(async (ctx) => {
			await saveMessage(ctx, components.agent, {
				threadId: agentThreadId,
				message: { role: "user", content: "which database do we use for billing?" },
			});
			await saveMessage(ctx, components.agent, {
				threadId: agentThreadId,
				message: { role: "assistant", content: "billing runs on postgres" },
			});
		});
		return { threadId, agentThreadId };
	}

	it('scope "history" searches the thread\'s messages and skips memory entirely', async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const { threadId, agentThreadId } = await threadWithHistory(t, orgId, agentId);

		await seedMemory(t, userId, { orgId, scope: "org", content: "billing is owned by finance" });

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "billing", scope: "history" },
		);

		expect(result.memories).toEqual([]);
		expect(result.messages.map((m) => m.text)).toContain("which database do we use for billing?");
	});

	it('scope "memory" searches memories and skips history entirely', async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const { threadId, agentThreadId } = await threadWithHistory(t, orgId, agentId);

		await seedMemory(t, userId, { orgId, scope: "org", content: "billing is owned by finance" });

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "billing", scope: "memory" },
		);

		expect(result.memories.map((m) => m.content)).toEqual(["billing is owned by finance"]);
		expect(result.messages).toEqual([]);
	});

	it('scope "all" (the default) unions both sources', async () => {
		const t = newTest();
		const { orgId, agentId, userId } = await setup(t);
		const { threadId, agentThreadId } = await threadWithHistory(t, orgId, agentId);

		await seedMemory(t, userId, { orgId, scope: "org", content: "billing is owned by finance" });

		const result = await searchResult(
			t,
			{ orgId, agentId, threadId, agentThreadId },
			{ query: "billing" },
		);

		expect(result.memories.map((m) => m.content)).toEqual(["billing is owned by finance"]);
		expect(result.messages.length).toBeGreaterThan(0);
	});
});
