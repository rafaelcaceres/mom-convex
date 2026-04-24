import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
	_setSandboxClientOverride,
	_setSandboxRepoOverride,
} from "../../sandbox/_libs/sandboxAccess";
import type { ISandboxClient, SandboxRepoDeps } from "../../sandbox/_libs/vercel";
import type { ToolInvokeScope } from "../_libs/resolveTools";
import { sandboxWriteImpl } from "./sandboxWrite";

const fakeCtx = {} as ActionCtx;
const fakeScope: ToolInvokeScope = {
	orgId: "org_A",
	agentId: "agents_1" as unknown as Id<"agents">,
	threadId: "threads_1" as unknown as Id<"threads">,
	agentThreadId: "agentThread_1",
	userId: null,
};

function opts() {
	return { signal: new AbortController().signal, scope: fakeScope };
}

function makeClient(overrides: Partial<ISandboxClient> = {}): ISandboxClient {
	return {
		create: vi.fn(async () => ({ sandboxId: "sbx_1" })),
		reconnect: vi.fn(async (id) => ({ sandboxId: id })),
		resume: vi.fn(async () => ({ sandboxId: "sbx_resumed" })),
		stop: vi.fn(async () => undefined),
		exec: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
		readFile: vi.fn(async () => null),
		writeFile: vi.fn(async () => undefined),
		...overrides,
	};
}

function makeRepo(): SandboxRepoDeps {
	return {
		getByThread: vi.fn(async () => null),
		registerSandbox: vi.fn(async () => "sandboxes:1" as unknown as Id<"sandboxes">),
		markUsed: vi.fn(async () => undefined),
		markDestroyed: vi.fn(async () => undefined),
	};
}

describe("M2-T12 sandbox.write impl", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		_setSandboxClientOverride(null);
		_setSandboxRepoOverride(null);
	});

	it("creates a file at the given path", async () => {
		const client = makeClient();
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		const result = (await sandboxWriteImpl(
			fakeCtx,
			{ path: "/vercel/sandbox/out.txt", content: "hello" },
			opts(),
		)) as { path: string; bytesWritten: number };

		expect(result.path).toBe("/vercel/sandbox/out.txt");
		expect(result.bytesWritten).toBe(5);
		expect(client.writeFile).toHaveBeenCalledWith("sbx_1", "/vercel/sandbox/out.txt", "hello");
	});

	it("overwrites an existing file on a second call", async () => {
		const client = makeClient();
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		await sandboxWriteImpl(fakeCtx, { path: "/tmp/a.txt", content: "one" }, opts());
		await sandboxWriteImpl(fakeCtx, { path: "/tmp/a.txt", content: "two" }, opts());

		expect(client.writeFile).toHaveBeenCalledTimes(2);
		expect(client.writeFile).toHaveBeenLastCalledWith("sbx_1", "/tmp/a.txt", "two");
	});

	it("rejects paths outside the workspace", async () => {
		_setSandboxClientOverride(makeClient());
		_setSandboxRepoOverride(makeRepo());

		await expect(
			sandboxWriteImpl(fakeCtx, { path: "/etc/passwd", content: "bad" }, opts()),
		).rejects.toThrow(/sandbox\.write/);
	});

	it("rejects content larger than the byte cap", async () => {
		_setSandboxClientOverride(makeClient());
		_setSandboxRepoOverride(makeRepo());

		const big = "x".repeat(1_000_001);
		await expect(
			sandboxWriteImpl(fakeCtx, { path: "/tmp/big.txt", content: big }, opts()),
		).rejects.toThrow(/exceeds/i);
	});
});
