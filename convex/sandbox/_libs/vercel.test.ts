import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { Sandbox } from "../domain/sandbox.model";
import {
	type ISandboxClient,
	type SandboxRepoDeps,
	destroySandbox,
	getOrCreateSandbox,
	resumeSandbox,
} from "./vercel";

function makeClientMock(overrides: Partial<ISandboxClient> = {}): ISandboxClient {
	return {
		create: vi.fn(async (_params) => ({ sandboxId: "sbx_new", persistentId: undefined })),
		reconnect: vi.fn(async (sandboxId) => ({ sandboxId })),
		resume: vi.fn(async (_persistentId, _tags) => ({ sandboxId: "sbx_resumed" })),
		stop: vi.fn(async (_sandboxId) => undefined),
		exec: vi.fn(async (_sandboxId, _args) => ({ stdout: "", stderr: "", exitCode: 0 })),
		readFile: vi.fn(async (_sandboxId, _path) => null),
		writeFile: vi.fn(async (_sandboxId, _path, _content) => undefined),
		...overrides,
	};
}

function makeRepoDepsMock(overrides: Partial<SandboxRepoDeps> = {}): SandboxRepoDeps {
	return {
		getByThread: vi.fn(async (_threadId) => null),
		registerSandbox: vi.fn(async (_args) => "sandboxes:1" as unknown as Id<"sandboxes">),
		markUsed: vi.fn(async (_args) => undefined),
		markDestroyed: vi.fn(async (_id) => undefined),
		...overrides,
	};
}

function makeExisting(overrides: Partial<Sandbox> = {}): Sandbox {
	return {
		_id: "sandboxes:existing" as unknown as Id<"sandboxes">,
		_creationTime: 0,
		orgId: "org_A",
		threadId: "threads:t1" as unknown as Id<"threads">,
		provider: "vercel",
		sandboxId: "sbx_existing",
		status: "active",
		createdAt: 0,
		lastUsedAt: 0,
		...overrides,
	};
}

const threadId = "threads:t1" as unknown as Id<"threads">;
const orgId = "org_A";

describe("M2-T11 getOrCreateSandbox", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates a new sandbox when the thread has none", async () => {
		const client = makeClientMock();
		const repo = makeRepoDepsMock();

		const result = await getOrCreateSandbox({
			client,
			repo,
			orgId,
			threadId,
			now: 1_000,
		});

		expect(result.action).toBe("created");
		expect(result.sandboxId).toBe("sbx_new");
		expect(client.create).toHaveBeenCalledTimes(1);
		expect(client.reconnect).not.toHaveBeenCalled();
		expect(repo.registerSandbox).toHaveBeenCalledWith({
			orgId,
			threadId,
			sandboxId: "sbx_new",
			persistentId: undefined,
			now: 1_000,
		});
	});

	it("includes orgId + threadId tags in the create params", async () => {
		const client = makeClientMock();
		const repo = makeRepoDepsMock();

		await getOrCreateSandbox({ client, repo, orgId, threadId, now: 0 });

		expect(client.create).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: expect.objectContaining({ orgId, threadId: String(threadId) }),
			}),
		);
	});

	it("reconnects when an active sandbox already exists", async () => {
		const existing = makeExisting({ sandboxId: "sbx_live", status: "active" });
		const client = makeClientMock();
		const repo = makeRepoDepsMock({ getByThread: vi.fn(async () => existing) });

		const result = await getOrCreateSandbox({ client, repo, orgId, threadId, now: 5_000 });

		expect(result.action).toBe("reused");
		expect(result.sandboxId).toBe("sbx_live");
		expect(client.reconnect).toHaveBeenCalledWith("sbx_live");
		expect(client.create).not.toHaveBeenCalled();
		expect(repo.markUsed).toHaveBeenCalledWith({ id: existing._id, now: 5_000 });
		expect(repo.registerSandbox).not.toHaveBeenCalled();
	});

	it("creates a new sandbox when the existing row is destroyed", async () => {
		const existing = makeExisting({ status: "destroyed" });
		const client = makeClientMock();
		const repo = makeRepoDepsMock({ getByThread: vi.fn(async () => existing) });

		const result = await getOrCreateSandbox({ client, repo, orgId, threadId, now: 10 });

		expect(result.action).toBe("created");
		expect(client.reconnect).not.toHaveBeenCalled();
		expect(client.create).toHaveBeenCalledTimes(1);
		expect(repo.registerSandbox).toHaveBeenCalledTimes(1);
	});

	it("creates a new sandbox when reconnect returns null (underlying VM gone)", async () => {
		const existing = makeExisting({ sandboxId: "sbx_zombie", status: "active" });
		const client = makeClientMock({ reconnect: vi.fn(async () => null) });
		const repo = makeRepoDepsMock({ getByThread: vi.fn(async () => existing) });

		const result = await getOrCreateSandbox({ client, repo, orgId, threadId, now: 10 });

		expect(result.action).toBe("created");
		expect(result.sandboxId).toBe("sbx_new");
		expect(client.reconnect).toHaveBeenCalledWith("sbx_zombie");
		expect(client.create).toHaveBeenCalledTimes(1);
		// Stale row gets tombstoned so the 1-per-thread invariant holds.
		expect(repo.markDestroyed).toHaveBeenCalledWith(existing._id);
		expect(repo.registerSandbox).toHaveBeenCalledTimes(1);
	});
});

describe("M2-T11 resumeSandbox", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("calls client.resume with the persistentId and injects tags", async () => {
		const client = makeClientMock();
		const repo = makeRepoDepsMock();

		const result = await resumeSandbox({
			client,
			repo,
			persistentId: "snap_abc",
			orgId,
			threadId,
			now: 1_000,
		});

		expect(client.resume).toHaveBeenCalledWith(
			"snap_abc",
			expect.objectContaining({
				tags: expect.objectContaining({ orgId, threadId: String(threadId) }),
			}),
		);
		expect(result.sandboxId).toBe("sbx_resumed");
		expect(repo.registerSandbox).toHaveBeenCalledWith(
			expect.objectContaining({ persistentId: "snap_abc", sandboxId: "sbx_resumed", now: 1_000 }),
		);
	});
});

describe("M2-T11 destroySandbox", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("stops the underlying sandbox and tombstones the DB row", async () => {
		const existing = makeExisting({ sandboxId: "sbx_kill", status: "active" });
		const client = makeClientMock();
		const repo = makeRepoDepsMock();

		await destroySandbox({ client, repo, row: existing });

		expect(client.stop).toHaveBeenCalledWith("sbx_kill");
		expect(repo.markDestroyed).toHaveBeenCalledWith(existing._id);
	});

	it("still tombstones the DB row if client.stop throws (ghost rows are worse than orphan VMs)", async () => {
		const existing = makeExisting({ sandboxId: "sbx_stuck" });
		const client = makeClientMock({
			stop: vi.fn(async () => {
				throw new Error("vercel 500");
			}),
		});
		const repo = makeRepoDepsMock();

		await expect(destroySandbox({ client, repo, row: existing })).rejects.toThrow(/vercel 500/);
		expect(repo.markDestroyed).toHaveBeenCalledWith(existing._id);
	});

	it("no-ops when the DB row is already destroyed", async () => {
		const existing = makeExisting({ status: "destroyed" });
		const client = makeClientMock();
		const repo = makeRepoDepsMock();

		await destroySandbox({ client, repo, row: existing });

		expect(client.stop).not.toHaveBeenCalled();
		expect(repo.markDestroyed).not.toHaveBeenCalled();
	});
});
