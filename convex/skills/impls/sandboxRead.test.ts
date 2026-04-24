import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
	_setSandboxClientOverride,
	_setSandboxRepoOverride,
} from "../../sandbox/_libs/sandboxAccess";
import type { ISandboxClient, SandboxRepoDeps } from "../../sandbox/_libs/vercel";
import type { ToolInvokeScope } from "../_libs/resolveTools";
import { sandboxReadImpl } from "./sandboxRead";

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

describe("M2-T12 sandbox.read impl", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		_setSandboxClientOverride(null);
		_setSandboxRepoOverride(null);
	});

	it("returns file content for a path under /vercel/sandbox/", async () => {
		const client = makeClient({
			readFile: vi.fn(async () => "hello world"),
		});
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		const result = (await sandboxReadImpl(
			fakeCtx,
			{ path: "/vercel/sandbox/hello.txt" },
			opts(),
		)) as { content: string | null };

		expect(result.content).toBe("hello world");
		expect(client.readFile).toHaveBeenCalledWith("sbx_1", "/vercel/sandbox/hello.txt");
	});

	it("returns content:null when the file does not exist", async () => {
		const client = makeClient({ readFile: vi.fn(async () => null) });
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		const result = (await sandboxReadImpl(
			fakeCtx,
			{ path: "/vercel/sandbox/missing.txt" },
			opts(),
		)) as { content: string | null };

		expect(result.content).toBeNull();
	});

	it("rejects absolute paths outside the workspace", async () => {
		_setSandboxClientOverride(makeClient());
		_setSandboxRepoOverride(makeRepo());

		await expect(sandboxReadImpl(fakeCtx, { path: "/etc/shadow" }, opts())).rejects.toThrow(
			/sandbox\.read/,
		);
	});

	it("rejects path traversal (..)", async () => {
		_setSandboxClientOverride(makeClient());
		_setSandboxRepoOverride(makeRepo());

		await expect(
			sandboxReadImpl(fakeCtx, { path: "/vercel/sandbox/../etc/passwd" }, opts()),
		).rejects.toThrow(/traversal/);
	});

	it("accepts relative paths (resolved against sandbox cwd)", async () => {
		const client = makeClient({ readFile: vi.fn(async () => "rel-content") });
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		const result = (await sandboxReadImpl(fakeCtx, { path: "hello.txt" }, opts())) as {
			content: string | null;
		};

		expect(result.content).toBe("rel-content");
		expect(client.readFile).toHaveBeenCalledWith("sbx_1", "hello.txt");
	});
});
