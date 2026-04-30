import type {
	LanguageModelV3FinishReason,
	LanguageModelV3StreamPart,
	LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
	_clearAgentCache,
	_setLanguageModelOverride,
} from "../../convex/agents/_libs/agentFactory";
import { _setSandboxClientOverride } from "../../convex/sandbox/_libs/sandboxAccess";
import type { ISandboxClient } from "../../convex/sandbox/_libs/vercel";
import { seedSkillCatalog } from "../../convex/skills/_seeds";
import { newTest } from "../_helpers/convex";

/**
 * M2-T19 — Gate de fechamento do milestone M2. Drives the full agentic loop
 * (LLM step → `sandbox.write` → LLM step → `sandbox.bash` → LLM step → final
 * text) using a scripted faux provider so the assertions don't depend on a
 * real Anthropic call. The Vercel sandbox client is also replaced with an
 * in-memory fake so the test runs without `VERCEL_TOKEN` and verifies that
 * (a) bookkeeping in `sandboxes` reflects exactly one active VM per thread,
 * (b) `costLedger` accumulates per-step rows for the LLM AND per tool call,
 * and (c) the assistant's final reply carries the FizzBuzz output the bash
 * step produced.
 *
 * The dispatcher's confirmation gate is bypassed via
 * `DEV_AUTO_APPROVE_WRITES=1` — both `sandbox.write` and `sandbox.bash` have
 * `sideEffect: "write"` and would otherwise return
 * `{requireConfirmation: true}` until M3-T11 wires real human-in-loop
 * approval.
 */

const FIZZBUZZ_OUTPUT = "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n";

const FIZZBUZZ_PY = [
	"for i in range(1, 16):",
	"    if i % 15 == 0: print('FizzBuzz')",
	"    elif i % 3 == 0: print('Fizz')",
	"    elif i % 5 == 0: print('Buzz')",
	"    else: print(i)",
].join("\n");

const FAKE_USAGE: LanguageModelV3Usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const TOOL_CALLS_FINISH: LanguageModelV3FinishReason = {
	unified: "tool-calls",
	raw: "tool_use",
};

const STOP_FINISH: LanguageModelV3FinishReason = { unified: "stop", raw: "stop" };

/**
 * Scripted three-step trace:
 *  1. emit `sandbox_write` tool-call (write fizzbuzz.py)
 *  2. emit `sandbox_bash`  tool-call (run it)
 *  3. emit final text containing the captured stdout
 *
 * Tool names are wire-shaped (`sandbox_write`, not `sandbox.write`) because
 * `buildToolSet` translates dots to underscores for Anthropic's tool-name
 * regex; the dispatcher resolves back to canonical via the closure-scoped
 * `skillKey`.
 */
function scriptedFizzBuzzModel(): MockLanguageModelV3 {
	let step = 0;
	return new MockLanguageModelV3({
		doStream: async () => {
			step += 1;
			const chunks: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }];
			if (step === 1) {
				chunks.push({
					type: "tool-call",
					toolCallId: "tc_write",
					toolName: "sandbox_write",
					input: JSON.stringify({ path: "/tmp/fb.py", content: FIZZBUZZ_PY }),
				});
				chunks.push({ type: "finish", finishReason: TOOL_CALLS_FINISH, usage: FAKE_USAGE });
			} else if (step === 2) {
				chunks.push({
					type: "tool-call",
					toolCallId: "tc_bash",
					toolName: "sandbox_bash",
					input: JSON.stringify({ command: "python3 /tmp/fb.py" }),
				});
				chunks.push({ type: "finish", finishReason: TOOL_CALLS_FINISH, usage: FAKE_USAGE });
			} else {
				const reply = `Output do FizzBuzz:\n${FIZZBUZZ_OUTPUT}`;
				chunks.push({ type: "text-start", id: "t0" });
				chunks.push({ type: "text-delta", id: "t0", delta: reply });
				chunks.push({ type: "text-end", id: "t0" });
				chunks.push({ type: "finish", finishReason: STOP_FINISH, usage: FAKE_USAGE });
			}
			return { stream: simulateReadableStream<LanguageModelV3StreamPart>({ chunks }) };
		},
	});
}

type SandboxCallLog = {
	create: number;
	exec: Array<{ command: string }>;
	write: Array<{ path: string; bytes: number }>;
	read: Array<{ path: string }>;
};

function makeFakeSandboxClient(): { client: ISandboxClient; calls: SandboxCallLog } {
	const calls: SandboxCallLog = { create: 0, exec: [], write: [], read: [] };
	const fs = new Map<string, string>();
	let nextId = 1;
	const client: ISandboxClient = {
		create: async () => {
			calls.create += 1;
			return { sandboxId: `sb_smoke_${nextId++}` };
		},
		reconnect: async (sandboxId) => ({ sandboxId }),
		resume: async () => ({ sandboxId: `sb_smoke_${nextId++}` }),
		stop: async () => {},
		exec: async (_sandboxId, args) => {
			calls.exec.push({ command: args.command });
			// Recognize the FizzBuzz invocation; everything else is a no-op so
			// the test surface stays narrow.
			if (/python3?\s+\/tmp\/fb\.py/.test(args.command)) {
				return { stdout: FIZZBUZZ_OUTPUT, stderr: "", exitCode: 0 };
			}
			return { stdout: "", stderr: "", exitCode: 0 };
		},
		readFile: async (_sandboxId, path) => {
			calls.read.push({ path });
			return fs.get(path) ?? null;
		},
		writeFile: async (_sandboxId, path, content) => {
			calls.write.push({ path, bytes: Buffer.byteLength(content, "utf8") });
			fs.set(path, content);
		},
	};
	return { client, calls };
}

describe("M2-T19 smoke: agentic FizzBuzz end-to-end", () => {
	const ORIGINAL_DEV_AUTO = process.env.DEV_AUTO_APPROVE_WRITES;

	beforeEach(() => {
		// `sandbox.write` / `sandbox.bash` are catalog `sideEffect: "write"`;
		// without this flag the dispatcher returns `requireConfirmation` and
		// the agent never reaches step 2.
		process.env.DEV_AUTO_APPROVE_WRITES = "1";
		_clearAgentCache();
		_setLanguageModelOverride(scriptedFizzBuzzModel());
	});

	afterEach(() => {
		_setLanguageModelOverride(null);
		_setSandboxClientOverride(null);
		_clearAgentCache();
		if (ORIGINAL_DEV_AUTO === undefined) {
			// biome-ignore lint/performance/noDelete: env isolation between tests
			delete process.env.DEV_AUTO_APPROVE_WRITES;
		} else {
			process.env.DEV_AUTO_APPROVE_WRITES = ORIGINAL_DEV_AUTO;
		}
	});

	it("scripted LLM drives write → bash → final text; sandbox + costLedger persisted", async () => {
		const t = newTest();

		// Catalog must exist before the agent is created so the `agents`
		// insert trigger can seed baseline skills (http.fetch, memory.search).
		// Discard the seed return value — `t.run` serializes through Convex's
		// value system and `SkillCatalogAgg` instances aren't a supported
		// type. The mutation already wrote the rows we care about.
		await t.run(async (ctx) => {
			await seedSkillCatalog(ctx);
		});

		const userId = await t.run((ctx) => ctx.db.insert("users", {}));
		const owner = t.withIdentity({ subject: userId });
		const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Smoke Org",
		});
		const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
		const agentId = agents[0]?._id;
		if (!agentId) throw new Error("expected default agent after onboarding");

		// Baseline trigger already enabled http.fetch + memory.search — turn
		// on the three sandbox skills the script will exercise.
		for (const skillKey of ["sandbox.write", "sandbox.read", "sandbox.bash"] as const) {
			await owner.mutation(api.skills.mutations.toggleSkill.default, {
				agentId,
				skillKey,
				action: "enable",
			});
		}

		const { client: fakeClient, calls } = makeFakeSandboxClient();
		_setSandboxClientOverride(fakeClient);

		const threadId = await owner.mutation(api.webChat.mutations.createThread.default, { orgId });

		await t.action(internal.agentRunner.actions.handleIncoming.default, {
			orgId,
			threadId,
			userMessage: {
				text: "crie /tmp/fb.py com FizzBuzz até 15, rode e mostre o output",
				senderId: String(userId),
			},
		});

		// Sandbox bookkeeping: exactly one active row per thread.
		const sandboxRows = await t.run((ctx) =>
			ctx.db
				.query("sandboxes")
				.withIndex("by_thread", (q) => q.eq("threadId", threadId))
				.collect(),
		);
		expect(sandboxRows).toHaveLength(1);
		expect(sandboxRows[0]).toMatchObject({
			status: "active",
			provider: "vercel",
			orgId,
		});

		// Cost ledger: at least one row per LLM step (3) + one per tool call (2)
		// — not asserting the exact count to stay resilient to AI-SDK
		// accounting quirks, but both flavors of `stepType` must appear.
		const costRows = await t.run((ctx) =>
			ctx.db
				.query("costLedger")
				.withIndex("by_thread", (q) => q.eq("threadId", threadId))
				.collect(),
		);
		expect(costRows.length).toBeGreaterThanOrEqual(3);
		const stepTypes = new Set(costRows.map((r) => r.stepType));
		expect(stepTypes.has("text-generation")).toBe(true);
		expect(stepTypes.has("tool-call")).toBe(true);
		const toolNames = new Set(
			costRows.filter((r) => r.stepType === "tool-call").map((r) => r.toolName),
		);
		expect(toolNames.has("sandbox_write")).toBe(true);
		expect(toolNames.has("sandbox_bash")).toBe(true);

		// Final assistant message carries the captured stdout.
		const messages = await owner.query(api.webChat.queries.listMessages.default, { threadId });
		const assistant = messages.find((m) => m.role === "assistant");
		expect(assistant).toBeDefined();
		expect(assistant?.text).toContain(FIZZBUZZ_OUTPUT);

		// Tool wiring sanity — the fake client saw exactly the calls the
		// script intended (single write, single exec).
		expect(calls.write).toEqual([
			{ path: "/tmp/fb.py", bytes: Buffer.byteLength(FIZZBUZZ_PY, "utf8") },
		]);
		expect(calls.exec).toHaveLength(1);
		expect(calls.exec[0]?.command).toMatch(/python3?\s+\/tmp\/fb\.py/);
	});
});
