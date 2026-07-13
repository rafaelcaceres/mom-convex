import { saveMessage } from "@convex-dev/agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, components, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createAgentThread } from "../../convex/agents/adapters/threadBridge";
import { _setEmbeddingModelOverride } from "../../convex/memory/_libs/embedding";
import { seedSkillCatalog } from "../../convex/skills/_seeds";
import type { MemorySearchResult } from "../../convex/skills/impls/memorySearch";
import { newTest } from "../_helpers/convex";
import {
	bagOfWordsEmbedding,
	bagOfWordsEmbeddingModel,
	mockEmbeddingModel,
} from "../_helpers/embedding";

/**
 * M3-T05 — cross-tenant isolation gate. **If this suite fails, do not merge.**
 *
 * Retrieval is the one place in this product where a single wrong argument
 * hands one customer another customer's private text, verbatim, through the
 * model's mouth. The blast radius is not "a bug"; it is the company. So this
 * suite is deliberately paranoid, and deliberately redundant with the
 * per-feature tests in `convex/skills/impls/memorySearch.test.ts`: those pin
 * that retrieval *works*, this one pins that it cannot *leak*.
 *
 * **Revision 2026-04-18.** The original spec tested `@convex-dev/rag` namespaces.
 * That component was cut (M3-T01) in favour of Convex's native `vectorIndex` on
 * the `memory` table, so the boundary being gated is now:
 *
 *   1. `ctx.vectorSearch(... filter: q.eq("orgId", ...))` — the index-side filter.
 *   2. `MemoryRepository.listVisibleByIds` — re-checks `orgId` on every row
 *      during hydration, because the index's filter is an argument and arguments
 *      can be wrong.
 *   3. `buildToolSet` — the turn's `scope` is *closed over* at toolset-build time
 *      from `agentDoc.orgId` / `thread.agentThreadId`. The model supplies `input`
 *      and only `input`. This is the defense that makes 1 and 2 sound: a model
 *      that cannot name a tenant cannot ask for one.
 *   4. `searchThreadMessages` — history is keyed by `agentThreadId`, a component
 *      thread id that likewise comes from the turn, never from the model.
 *
 * Three orgs, each holding a memory whose words deliberately *collide* with the
 * others ("the vault passphrase is <marker>"). Under the bag-of-words embedding,
 * cosine similarity is word overlap — so a query for "vault passphrase" scores
 * every org's secret highly, and the **only** thing standing between org A and
 * org B's passphrase is the tenant filter. That is the point: the fixture is
 * built so that a regression in the filter cannot hide behind a low score.
 */

const MARKERS = {
	A: "quetzal",
	B: "narwhal",
	C: "axolotl",
} as const;

type OrgKey = keyof typeof MARKERS;
const ORG_KEYS = Object.keys(MARKERS) as OrgKey[];

/** Enough rows that a leak has somewhere to hide, cheap enough to score in JS. */
const FILLER_PER_ORG = 12;

type Fixture = {
	key: OrgKey;
	marker: string;
	orgId: string;
	agentId: Id<"agents">;
	threadId: Id<"threads">;
	agentThreadId: string;
	channelKey: string;
	userId: Id<"users">;
	secretId: Id<"memory">;
};

type Scope = Pick<Fixture, "orgId" | "agentId" | "threadId" | "agentThreadId">;

/**
 * One fully-populated tenant: org, default agent, a Slack thread, memories at
 * every scope, and message history. Rows are written raw (`t.run`) with their
 * vector already attached — that is what "in the index" means, and the M3-T02
 * trigger never sees a raw `ctx.db` write anyway.
 *
 * Every memory row in a searched org needs an `embedding`: convex-test scores
 * *every* row in the filtered partition, so an unembedded row crashes its cosine
 * computation. Real Convex simply omits such rows from the index.
 */
async function seedOrg(t: ReturnType<typeof newTest>, key: OrgKey): Promise<Fixture> {
	const marker = MARKERS[key];
	const userId = await t.run((ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: userId });
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: `Org ${key}`,
	});
	const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;

	const installId = `inst_${key}`;
	const channelId = `C_ENG_${key}`;
	const channelKey = `slack:${installId}:${channelId}`;
	const agentThreadId = await t.run((ctx) => createAgentThread(ctx, { title: channelId }));
	const threadId = await t.run((ctx) =>
		ctx.db.insert("threads", {
			orgId,
			agentId,
			agentThreadId,
			bindingKey: `${channelKey}:1.1`,
			binding: { type: "slack", installId, channelId, threadTs: "1.1" },
		}),
	);

	const insert = (doc: {
		scope: "org" | "agent" | "channel" | "thread";
		content: string;
		agentId?: Id<"agents">;
		threadId?: Id<"threads">;
		channelKey?: string;
	}) =>
		t.run((ctx) =>
			ctx.db.insert("memory", {
				orgId,
				scope: doc.scope,
				agentId: doc.agentId,
				threadId: doc.threadId,
				channelKey: doc.channelKey,
				content: doc.content,
				alwaysOn: false,
				updatedBy: userId,
				updatedAt: Date.now(),
				embedding: bagOfWordsEmbedding(doc.content),
			}),
		);

	// The honeypot. Same words in all three orgs, different marker — so word
	// overlap alone would surface all three, and only the tenant filter doesn't.
	const secretId = await insert({ scope: "org", content: `the vault passphrase is ${marker}` });

	// One row per non-org scope, so hydration's scope re-check is exercised
	// alongside the tenant check rather than after it.
	await insert({ scope: "agent", agentId, content: `the ${marker} agent persona is terse` });
	await insert({
		scope: "channel",
		channelKey,
		content: `the on-call rotation for ${marker} lives in the channel doc`,
	});
	await insert({ scope: "thread", agentId, threadId, content: `this thread tracks ${marker}` });

	// Filler with words shared across every org: a generic query has real hits in
	// all three, which is what makes "only mine came back" a meaningful assertion
	// rather than an artifact of an empty neighbourhood.
	for (let i = 0; i < FILLER_PER_ORG; i++) {
		await insert({ scope: "org", content: `python deploy note ${i} for ${marker}` });
	}

	await t.run(async (ctx) => {
		await saveMessage(ctx, components.agent, {
			threadId: agentThreadId,
			message: { role: "user", content: `what is the vault passphrase for ${marker}?` },
		});
		await saveMessage(ctx, components.agent, {
			threadId: agentThreadId,
			message: { role: "assistant", content: `the vault passphrase is ${marker}` },
		});
	});

	return {
		key,
		marker,
		orgId,
		agentId,
		threadId,
		agentThreadId,
		channelKey,
		userId,
		secretId,
	};
}

async function seedAll(t: ReturnType<typeof newTest>): Promise<Record<OrgKey, Fixture>> {
	// Swallow the return value: `t.run` serializes whatever the callback yields,
	// and `seedSkillCatalog` hands back aggregates, which are not Convex values.
	await t.run(async (ctx) => {
		await seedSkillCatalog(ctx);
	});
	const out = {} as Record<OrgKey, Fixture>;
	for (const key of ORG_KEYS) out[key] = await seedOrg(t, key);
	return out;
}

/**
 * Search exactly as a turn would: through the real dispatcher, with the scope the
 * runner would have built from the DB. `args` is the only thing a model controls.
 */
async function search(
	t: ReturnType<typeof newTest>,
	scope: Scope,
	args: Record<string, unknown>,
): Promise<MemorySearchResult> {
	const raw = (await t.action(internal.skills.actions.invoke.default, {
		skillKey: "memory.search",
		args,
		scope: {
			orgId: scope.orgId,
			agentId: scope.agentId,
			threadId: scope.threadId,
			agentThreadId: scope.agentThreadId,
			userId: null,
		},
		toolCallId: "tc_isolation",
	})) as { isError?: boolean; content: Array<{ type: string; text: string }> };
	expect(raw.isError).not.toBe(true);
	return JSON.parse(raw.content[0]?.text ?? "{}") as MemorySearchResult;
}

/**
 * The load-bearing assertion of this file: resolve every hit back to its stored
 * row and read the tenant off the row itself.
 *
 * A hit's payload (`content`, `score`) is the wrong thing to assert on — it is
 * the very data a leak would be carrying, so matching against expected strings
 * only proves the leak is well-formed. Ownership has to be read from the source.
 */
async function ownersOf(
	t: ReturnType<typeof newTest>,
	result: MemorySearchResult,
): Promise<string[]> {
	return t.run(async (ctx) => {
		const rows = await Promise.all(result.memories.map((m) => ctx.db.get(m._id as Id<"memory">)));
		return rows.map((r) => r?.orgId ?? "<<missing row>>");
	});
}

describe("M3-T05 cross-tenant isolation — MERGE GATE", () => {
	beforeEach(() => {
		_setEmbeddingModelOverride(bagOfWordsEmbeddingModel());
	});

	afterEach(() => {
		// Restore the global default rather than clearing it: a late scheduled embed
		// from another suite would otherwise reach for the real provider.
		_setEmbeddingModelOverride(mockEmbeddingModel());
	});

	it("a query that matches every org's secret returns only the caller's", async () => {
		const t = newTest();
		const orgs = await seedAll(t);

		// "vault passphrase" has high word overlap with all three secrets. Without
		// the tenant filter this query is a three-way leak.
		for (const key of ORG_KEYS) {
			const org = orgs[key];
			const result = await search(t, org, { query: "vault passphrase", scope: "memory" });

			const owners = await ownersOf(t, result);
			expect(result.memories.length).toBeGreaterThan(0);
			expect(new Set(owners)).toEqual(new Set([org.orgId]));

			// And the content confirms it is *its own* secret it got back, not a
			// well-scored neighbour's.
			const contents = result.memories.map((m) => m.content);
			expect(contents).toContain(`the vault passphrase is ${org.marker}`);
			for (const other of ORG_KEYS.filter((k) => k !== key)) {
				expect(contents).not.toContain(`the vault passphrase is ${orgs[other].marker}`);
			}
		}
	});

	it("searching for another org's unique marker returns nothing — all six directions", async () => {
		const t = newTest();
		const orgs = await seedAll(t);

		for (const self of ORG_KEYS) {
			for (const other of ORG_KEYS.filter((k) => k !== self)) {
				const result = await search(t, orgs[self], {
					query: orgs[other].marker,
					scope: "memory",
				});

				const owners = await ownersOf(t, result);
				expect(owners.every((o) => o === orgs[self].orgId)).toBe(true);
				expect(result.memories.map((m) => m.content).join(" ")).not.toContain(orgs[other].marker);
			}
		}
	});

	it("aggregate invariant: across every org × every query, no hit is owned by another tenant", async () => {
		const t = newTest();
		const orgs = await seedAll(t);

		const queries = [
			"vault passphrase",
			"python",
			"deploy note",
			"on-call rotation",
			"agent persona",
			...ORG_KEYS.map((k) => MARKERS[k]),
		];

		const violations: string[] = [];
		for (const key of ORG_KEYS) {
			const org = orgs[key];
			for (const query of queries) {
				const result = await search(t, org, { query, scope: "memory", limit: 50 });
				const owners = await ownersOf(t, result);
				for (const owner of owners) {
					if (owner !== org.orgId) violations.push(`[${query}] org ${key} saw row from ${owner}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});

	it("hydration re-checks the tenant, so a wrong index filter cannot leak on its own", async () => {
		const t = newTest();
		const orgs = await seedAll(t);

		// Simulates the bug the index filter is supposed to prevent: ids from every
		// org handed to org A's hydration step, as a mis-scoped `vectorSearch` would.
		// `listVisibleByIds` re-reads `orgId` off each row precisely so that this —
		// the last hop before content reaches the model — is not load-bearing on an
		// argument being right.
		const allSecretIds = ORG_KEYS.map((k) => orgs[k].secretId);
		const visible = await t.query(internal.memory.queries.listVisibleByIdsInternal.default, {
			orgId: orgs.A.orgId,
			agentId: orgs.A.agentId,
			threadId: orgs.A.threadId,
			ids: allSecretIds,
		});

		expect(visible).toHaveLength(1);
		expect(visible[0]?._id).toBe(orgs.A.secretId);
		expect(visible[0]?.orgId).toBe(orgs.A.orgId);
		expect(visible.map((r) => r.content).join(" ")).not.toContain(MARKERS.B);
		expect(visible.map((r) => r.content).join(" ")).not.toContain(MARKERS.C);
	});

	it("the model cannot name a tenant: orgId in the tool input is ignored", async () => {
		const t = newTest();
		const orgs = await seedAll(t);

		// A prompt-injected model trying the obvious thing. `buildToolSet` closes
		// over the real scope and the zod schema drops unknown keys, so these are
		// inert — but "inert" is a claim worth a test, because the day someone
		// spreads `input` into the scope this is the only thing that will notice.
		const result = await search(t, orgs.A, {
			query: "vault passphrase",
			scope: "memory",
			orgId: orgs.B.orgId,
			agentThreadId: orgs.B.agentThreadId,
			threadId: orgs.B.threadId,
		});

		const owners = await ownersOf(t, result);
		expect(new Set(owners)).toEqual(new Set([orgs.A.orgId]));
		expect(result.memories.map((m) => m.content).join(" ")).not.toContain(MARKERS.B);
	});

	it("history search is confined to the caller's own thread", async () => {
		const t = newTest();
		const orgs = await seedAll(t);

		// Every org's thread contains the literal phrase, so a keyword search for it
		// leaks across tenants the moment `agentThreadId` stops being derived from
		// the turn.
		for (const key of ORG_KEYS) {
			const org = orgs[key];
			const result = await search(t, org, { query: "vault passphrase", scope: "history" });

			const texts = result.messages.map((m) => m.text).join(" ");
			expect(result.messages.length).toBeGreaterThan(0);
			expect(texts).toContain(org.marker);
			for (const other of ORG_KEYS.filter((k) => k !== key)) {
				expect(texts).not.toContain(orgs[other].marker);
			}
		}
	});

	it("a write in one org is invisible to another, and a delete only affects its own", async () => {
		const t = newTest();
		const orgs = await seedAll(t);

		const bBefore = await search(t, orgs.B, { query: "vault passphrase", scope: "memory" });
		expect(bBefore.memories.map((m) => m.content)).toContain(
			`the vault passphrase is ${MARKERS.B}`,
		);

		// Insert into A — B must not see it.
		await t.run((ctx) =>
			ctx.db.insert("memory", {
				orgId: orgs.A.orgId,
				scope: "org",
				content: "the vault passphrase is rotating tomorrow",
				alwaysOn: false,
				updatedBy: orgs.A.userId,
				updatedAt: Date.now(),
				embedding: bagOfWordsEmbedding("the vault passphrase is rotating tomorrow"),
			}),
		);

		const bAfterInsert = await search(t, orgs.B, { query: "vault passphrase", scope: "memory" });
		expect(bAfterInsert.memories.map((m) => m.content)).not.toContain(
			"the vault passphrase is rotating tomorrow",
		);
		expect(new Set(await ownersOf(t, bAfterInsert))).toEqual(new Set([orgs.B.orgId]));

		// Delete A's secret — it leaves A's results, and B's are untouched.
		await t.run((ctx) => ctx.db.delete(orgs.A.secretId));

		const aAfterDelete = await search(t, orgs.A, { query: "vault passphrase", scope: "memory" });
		expect(aAfterDelete.memories.map((m) => m.content)).not.toContain(
			`the vault passphrase is ${MARKERS.A}`,
		);

		const bAfterDelete = await search(t, orgs.B, { query: "vault passphrase", scope: "memory" });
		expect(bAfterDelete.memories.map((m) => m.content)).toContain(
			`the vault passphrase is ${MARKERS.B}`,
		);
		expect(new Set(await ownersOf(t, bAfterDelete))).toEqual(new Set([orgs.B.orgId]));
	});

	it("default scope 'all' — the union of both sources is still single-tenant", async () => {
		const t = newTest();
		const orgs = await seedAll(t);

		// The scope the model gets when it doesn't pick one. Both halves at once is
		// the configuration production actually runs, so it is the one that has to
		// hold.
		for (const key of ORG_KEYS) {
			const org = orgs[key];
			const result = await search(t, org, { query: "vault passphrase", limit: 50 });

			expect(new Set(await ownersOf(t, result))).toEqual(new Set([org.orgId]));

			const blob = [
				...result.memories.map((m) => m.content),
				...result.messages.map((m) => m.text),
			].join(" ");
			for (const other of ORG_KEYS.filter((k) => k !== key)) {
				expect(blob).not.toContain(orgs[other].marker);
			}
		}
	});
});
