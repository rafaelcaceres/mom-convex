import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { _resetSkillRegistry, registerSkill } from "../_libs/skillImpls";
import { seedSkillCatalog } from "../_seeds";

const baseScope = {
	orgId: "org_A",
	agentId: "placeholder" as unknown as Id<"agents">,
	threadId: "placeholder" as unknown as Id<"threads">,
	agentThreadId: "agentThread_1",
	userId: null,
};

async function setup(t: ReturnType<typeof newTest>): Promise<typeof baseScope> {
	// Seed the catalog so sideEffect checks resolve against real rows.
	await t.run(async (ctx) => {
		await seedSkillCatalog(ctx);
	});
	const ids = await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {});
		const agentId = await ctx.db.insert("agents", {
			orgId: "org_A",
			slug: "default",
			name: "Default",
			systemPrompt: "You are mom.",
			modelId: "claude-sonnet-4-5",
			modelProvider: "anthropic",
			isDefault: true,
			toolsAllowlist: [],
		});
		const threadId = await ctx.db.insert("threads", {
			orgId: "org_A",
			agentId,
			bindingKey: `web:users:${userId}`,
			binding: { type: "web", userId },
			agentThreadId: "agentThread_1",
		});
		return { agentId, threadId };
	});
	return { ...baseScope, agentId: ids.agentId, threadId: ids.threadId };
}

describe("M2-T05 skills.invoke action", () => {
	beforeEach(() => {
		_resetSkillRegistry();
	});
	afterEach(() => {
		_resetSkillRegistry();
		vi.restoreAllMocks();
	});

	it("unknown skill key returns structured error (no throw)", async () => {
		const t = newTest();
		const scope = await setup(t);

		const result = await t.action(internal.skills.actions.invoke.default, {
			skillKey: "does.not.exist",
			args: {},
			toolCallId: "tc_unknown",
			scope,
		});

		expect(result).toMatchObject({
			isError: true,
			content: [{ type: "text", text: expect.stringMatching(/unknown.*does\.not\.exist/i) }],
		});
	});

	it("known skill dispatches to the registered impl with input, scope and signal", async () => {
		const t = newTest();
		const scope = await setup(t);

		const impl = vi.fn(async (_ctx: unknown, input: unknown, opts: { signal: AbortSignal }) => {
			expect(opts.signal).toBeInstanceOf(AbortSignal);
			return { echo: input };
		});
		registerSkill("http.fetch", impl);

		const result = await t.action(internal.skills.actions.invoke.default, {
			skillKey: "http.fetch",
			args: { url: "https://api.example.com" },
			toolCallId: "tc_dispatch",
			scope,
		});

		expect(impl).toHaveBeenCalledTimes(1);
		const [, input] = impl.mock.calls[0] ?? [];
		expect(input).toEqual({ url: "https://api.example.com" });

		expect(result).toMatchObject({
			isError: false,
			content: [
				{
					type: "text",
					text: expect.stringContaining('"echo"'),
				},
			],
		});
	});

	it("impl error returns structured error with redacted + truncated stack", async () => {
		const t = newTest();
		const scope = await setup(t);

		registerSkill("http.fetch", async () => {
			const err = new Error("boom: token=sk-ant-api03-supersecret12345");
			err.stack = `Error: boom\n${Array.from({ length: 20 }, (_, i) => `    at frame${i}`).join("\n")}`;
			throw err;
		});

		const result = (await t.action(internal.skills.actions.invoke.default, {
			skillKey: "http.fetch",
			args: { url: "https://x" },
			toolCallId: "tc_err",
			scope,
		})) as { isError: boolean; content: Array<{ type: string; text: string }> };

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).not.toContain("sk-ant-api03-supersecret12345");
		expect(result.content[0]?.text).toMatch(/http\.fetch/);
	});

	it("write-side-effect skill short-circuits to requireConfirmation stub", async () => {
		const t = newTest();
		const scope = await setup(t);

		const impl = vi.fn(async () => ({ ran: true }));
		registerSkill("sandbox.bash", impl);

		const result = await t.action(internal.skills.actions.invoke.default, {
			skillKey: "sandbox.bash",
			args: { command: "echo hello" },
			toolCallId: "tc_conf_w",
			scope,
		});

		expect(impl).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			requireConfirmation: true,
			preview: expect.objectContaining({
				skillKey: "sandbox.bash",
				args: { command: "echo hello" },
			}),
		});
	});

	it("read-side-effect skill with dangerous arg pattern ALSO requires confirmation", async () => {
		const t = newTest();
		const scope = await setup(t);

		const impl = vi.fn();
		// http.fetch is sideEffect:"read" in the catalog, but `rm -rf` in args still trips the heuristic.
		registerSkill("http.fetch", impl);

		const result = await t.action(internal.skills.actions.invoke.default, {
			skillKey: "http.fetch",
			args: { url: "https://example.com", body: "rm -rf /" },
			toolCallId: "tc_conf_r",
			scope,
		});

		expect(impl).not.toHaveBeenCalled();
		expect(result).toMatchObject({ requireConfirmation: true });
	});

	it("emits a structured audit log line per call", async () => {
		const t = newTest();
		const scope = await setup(t);
		registerSkill("http.fetch", async () => ({ ok: true }));

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

		await t.action(internal.skills.actions.invoke.default, {
			skillKey: "http.fetch",
			args: { url: "https://example.com" },
			toolCallId: "tc_audit",
			scope,
		});

		const auditLines = logSpy.mock.calls
			.map((c) => String(c[0]))
			.filter((line) => line.includes('"type":"skills.invoke"'));
		expect(auditLines).toHaveLength(1);
		const parsed = JSON.parse(auditLines[0] ?? "{}");
		expect(parsed).toMatchObject({
			type: "skills.invoke",
			skillKey: "http.fetch",
			status: "success",
			orgId: "org_A",
		});
		expect(typeof parsed.durationMs).toBe("number");
	});
});
