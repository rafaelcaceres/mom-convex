import { asSchema } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	type ResolvedSkillEntry,
	type ToolInvokeScope,
	buildToolSet,
	toolNameFromSkillKey,
} from "./resolveTools";
import { zodToJsonSchemaString } from "./zodSerialize";

const scope: ToolInvokeScope = {
	orgId: "org_A",
	agentId: "agents:a1" as ToolInvokeScope["agentId"],
	threadId: "threads:t1" as ToolInvokeScope["threadId"],
	agentThreadId: "agentThread_1",
	userId: null,
};

const httpFetch: ResolvedSkillEntry = {
	skillKey: "http.fetch",
	name: "HTTP Fetch",
	description: "Fetch an HTTP resource",
	zodSchemaJson: zodToJsonSchemaString(
		z.object({ url: z.string(), method: z.enum(["GET", "POST"]).optional() }),
	),
	sideEffect: "read",
	config: undefined,
};

const memorySearch: ResolvedSkillEntry = {
	skillKey: "memory.search",
	name: "Memory Search",
	description: "Semantic search over long-lived memory",
	zodSchemaJson: zodToJsonSchemaString(z.object({ query: z.string() })),
	sideEffect: "read",
	config: undefined,
};

// Canonical AI-SDK-safe names for the entries above.
const HTTP_FETCH_TOOL = toolNameFromSkillKey(httpFetch.skillKey);
const MEMORY_SEARCH_TOOL = toolNameFromSkillKey(memorySearch.skillKey);

describe("M2-T04 toolNameFromSkillKey", () => {
	it("rewrites dotted skillKeys to match Anthropic's ^[a-zA-Z0-9_-]{1,128}$", () => {
		expect(toolNameFromSkillKey("http.fetch")).toBe("http_fetch");
		expect(toolNameFromSkillKey("sandbox.bash")).toBe("sandbox_bash");
		expect(toolNameFromSkillKey("already_ok")).toBe("already_ok");
		expect(toolNameFromSkillKey("a.b.c")).toBe("a_b_c");
	});
});

describe("M2-T04 buildToolSet", () => {
	it("keys the ToolSet by the sanitized name (not the raw skillKey)", () => {
		const runAction = vi.fn().mockResolvedValue({ ok: true });
		const tools = buildToolSet({ entries: [httpFetch, memorySearch], runAction, scope });

		expect(Object.keys(tools).sort()).toEqual([HTTP_FETCH_TOOL, MEMORY_SEARCH_TOOL].sort());
		expect(tools[HTTP_FETCH_TOOL]?.description).toBe("Fetch an HTTP resource");
		expect(tools[MEMORY_SEARCH_TOOL]?.description).toBe("Semantic search over long-lived memory");
	});

	it("rehydrates the input schema from the stored JSON", () => {
		const runAction = vi.fn().mockResolvedValue({ ok: true });
		const tools = buildToolSet({ entries: [httpFetch], runAction, scope });
		const schema = asSchema(tools[HTTP_FETCH_TOOL]?.inputSchema);
		expect(schema.jsonSchema).toMatchObject({
			type: "object",
			properties: {
				url: { type: "string" },
			},
		});
	});

	it("tool.execute delegates to runAction with the original (dotted) skillKey", async () => {
		const runAction = vi.fn().mockResolvedValue({ result: "hello" });
		const tools = buildToolSet({ entries: [httpFetch], runAction, scope });

		const out = await tools[HTTP_FETCH_TOOL]?.execute?.(
			{ url: "https://example.com" },
			{ toolCallId: "tc_1", messages: [] },
		);

		expect(out).toEqual({ result: "hello" });
		expect(runAction).toHaveBeenCalledTimes(1);
		const [fnRef, payload] = runAction.mock.calls[0] ?? [];
		expect(fnRef).toBeDefined();
		expect(payload).toMatchObject({
			skillKey: "http.fetch",
			args: { url: "https://example.com" },
			toolCallId: "tc_1",
			scope: {
				orgId: "org_A",
				agentId: scope.agentId,
				threadId: scope.threadId,
			},
		});
	});

	it("retries once on a transient error, then succeeds", async () => {
		const runAction = vi
			.fn()
			.mockRejectedValueOnce(new Error("fetch failed: network unreachable"))
			.mockResolvedValueOnce({ result: "second try" });

		const tools = buildToolSet({ entries: [httpFetch], runAction, scope });
		const out = await tools[HTTP_FETCH_TOOL]?.execute?.(
			{ url: "https://example.com" },
			{ toolCallId: "tc_retry", messages: [] },
		);

		expect(out).toEqual({ result: "second try" });
		expect(runAction).toHaveBeenCalledTimes(2);
	});

	it("does NOT retry on non-transient errors (e.g. validation)", async () => {
		const runAction = vi.fn().mockRejectedValue(new Error("Invalid URL"));
		const tools = buildToolSet({ entries: [httpFetch], runAction, scope });

		await expect(
			tools[HTTP_FETCH_TOOL]?.execute?.(
				{ url: "not-a-url" },
				{ toolCallId: "tc_validation", messages: [] },
			),
		).rejects.toThrow(/invalid url/i);
		expect(runAction).toHaveBeenCalledTimes(1);
	});
});
