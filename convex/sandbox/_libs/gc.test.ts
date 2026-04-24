import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { Sandbox } from "../domain/sandbox.model";
import { type GcDeps, runGc } from "./gc";
import type { ISandboxClient, SandboxRepoDeps } from "./vercel";

function makeClientMock(overrides: Partial<ISandboxClient> = {}): ISandboxClient {
	return {
		create: vi.fn(async () => ({ sandboxId: "sbx_new" })),
		reconnect: vi.fn(async (sandboxId) => ({ sandboxId })),
		resume: vi.fn(async () => ({ sandboxId: "sbx_resumed" })),
		stop: vi.fn(async () => undefined),
		exec: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
		readFile: vi.fn(async () => null),
		writeFile: vi.fn(async () => undefined),
		...overrides,
	};
}

function makeRepoDepsMock(overrides: Partial<SandboxRepoDeps> = {}): SandboxRepoDeps {
	return {
		getByThread: vi.fn(async () => null),
		registerSandbox: vi.fn(async () => "sandboxes:0" as unknown as Id<"sandboxes">),
		markUsed: vi.fn(async () => undefined),
		markDestroyed: vi.fn(async () => undefined),
		...overrides,
	};
}

function makeRow(overrides: Partial<Sandbox> & Pick<Sandbox, "_id" | "lastUsedAt">): Sandbox {
	return {
		_creationTime: 0,
		orgId: "org_A",
		threadId: "threads:t" as unknown as Id<"threads">,
		provider: "vercel",
		sandboxId: `sbx_${overrides._id}`,
		status: "active",
		createdAt: 0,
		...overrides,
	};
}

/**
 * The tests drive `runGc` with a fake `listIdle` that applies the real
 * threshold predicate to an in-memory list. This keeps the unit pure
 * (no convex-test harness) while still exercising the "only 8d gets
 * destroyed" acceptance shape from M2-T16. The repository's own
 * threshold filter is covered in `sandbox.repository.test.ts`.
 */
function listIdleFromPool(pool: Sandbox[]): GcDeps["listIdle"] {
	return async ({ olderThanMs, now }) =>
		pool.filter((r) => r.status === "active" && now - r.lastUsedAt > olderThanMs);
}

const ONE_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * ONE_DAY;
const NOW = 100 * ONE_DAY;

describe("M2-T16 runGc", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("only destroys sandboxes idle longer than olderThanMs", async () => {
		const pool: Sandbox[] = [
			makeRow({ _id: "a" as unknown as Id<"sandboxes">, lastUsedAt: NOW - 1 * ONE_DAY }),
			makeRow({ _id: "b" as unknown as Id<"sandboxes">, lastUsedAt: NOW - 5 * ONE_DAY }),
			makeRow({ _id: "c" as unknown as Id<"sandboxes">, lastUsedAt: NOW - 8 * ONE_DAY }),
		];
		const client = makeClientMock();
		const repo = makeRepoDepsMock();

		const result = await runGc(
			{ client, repo, listIdle: listIdleFromPool(pool) },
			{ now: NOW, olderThanMs: SEVEN_DAYS },
		);

		expect(result.total).toBe(1);
		expect(result.destroyed).toBe(1);
		expect(result.errors).toEqual([]);
		expect(client.stop).toHaveBeenCalledTimes(1);
		expect(client.stop).toHaveBeenCalledWith("sbx_c");
		expect(repo.markDestroyed).toHaveBeenCalledTimes(1);
		expect(repo.markDestroyed).toHaveBeenCalledWith("c" as unknown as Id<"sandboxes">);
	});

	it("dry-run returns the kill list without calling client.stop", async () => {
		const pool: Sandbox[] = [
			makeRow({ _id: "c" as unknown as Id<"sandboxes">, lastUsedAt: NOW - 10 * ONE_DAY }),
			makeRow({ _id: "d" as unknown as Id<"sandboxes">, lastUsedAt: NOW - 9 * ONE_DAY }),
		];
		const client = makeClientMock();
		const repo = makeRepoDepsMock();

		const result = await runGc(
			{ client, repo, listIdle: listIdleFromPool(pool) },
			{ now: NOW, olderThanMs: SEVEN_DAYS, dryRun: true },
		);

		expect(result.dryRun).toBe(true);
		expect(result.total).toBe(2);
		expect(result.destroyed).toBe(0);
		expect(result.inspected).toHaveLength(2);
		expect(result.inspected[0]).toMatchObject({ sandboxId: "sbx_c" });
		expect(client.stop).not.toHaveBeenCalled();
		expect(repo.markDestroyed).not.toHaveBeenCalled();
	});

	it("continues destroying siblings when one client.stop throws", async () => {
		const pool: Sandbox[] = [
			makeRow({ _id: "a" as unknown as Id<"sandboxes">, lastUsedAt: NOW - 10 * ONE_DAY }),
			makeRow({ _id: "b" as unknown as Id<"sandboxes">, lastUsedAt: NOW - 11 * ONE_DAY }),
			makeRow({ _id: "c" as unknown as Id<"sandboxes">, lastUsedAt: NOW - 12 * ONE_DAY }),
		];
		const client = makeClientMock({
			stop: vi.fn(async (sandboxId: string) => {
				if (sandboxId === "sbx_b") throw new Error("vercel 500");
			}),
		});
		const repo = makeRepoDepsMock();

		const result = await runGc(
			{ client, repo, listIdle: listIdleFromPool(pool) },
			{ now: NOW, olderThanMs: SEVEN_DAYS },
		);

		// destroySandbox always tombstones in finally, so even the failing row
		// gets markDestroyed'd. That's by design — ghost rows are worse than
		// orphan VMs.
		expect(client.stop).toHaveBeenCalledTimes(3);
		expect(repo.markDestroyed).toHaveBeenCalledTimes(3);
		expect(result.total).toBe(3);
		expect(result.destroyed).toBe(2);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ sandboxId: "sbx_b", message: "vercel 500" });
	});

	it("reports zero work when no sandboxes are idle", async () => {
		const client = makeClientMock();
		const repo = makeRepoDepsMock();

		const result = await runGc(
			{ client, repo, listIdle: listIdleFromPool([]) },
			{ now: NOW, olderThanMs: SEVEN_DAYS },
		);

		expect(result.total).toBe(0);
		expect(result.destroyed).toBe(0);
		expect(client.stop).not.toHaveBeenCalled();
	});
});
