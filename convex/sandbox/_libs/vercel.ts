import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import type { Id } from "../../_generated/dataModel";
import type { Sandbox } from "../domain/sandbox.model";

/**
 * Vercel Sandbox wrapper (M2-T11). Splits into three layers:
 *
 *  1. `ISandboxClient` — thin, mockable facade over `@vercel/sandbox`. Methods
 *     map 1:1 to our usage (`create`, `reconnect`, `resume`, `stop`). The
 *     actual SDK surface is larger (filesystem, exec, snapshots) — we only
 *     expose what M2-T11/T12 need, so tests don't have to stub irrelevant
 *     API. Adding new ops is additive.
 *
 *  2. `SandboxRepoDeps` — injected DB callbacks so the pure orchestration
 *     below is testable without `convex-test` or an `ActionCtx`. The real
 *     production wiring (in an `internalAction`) resolves these from
 *     `ctx.runQuery`/`ctx.runMutation`.
 *
 *  3. `getOrCreateSandbox` / `resumeSandbox` / `destroySandbox` — pure
 *     orchestration functions. They encode the 1-per-thread invariant
 *     (tombstone stale rows before inserting new ones) and ensure DB
 *     bookkeeping survives even if the Vercel API throws partway.
 *
 * The Vercel SDK has no "resume" verb — we implement resume as
 * `Sandbox.create({ source: { type: "snapshot", snapshotId } })`. Our
 * `persistentId` is the Vercel snapshot id.
 *
 * "Tags" are injected as env vars (`MOM_ORG_ID`, `MOM_THREAD_ID`) rather
 * than native labels: the SDK (v1.10.0) doesn't expose a tagging API.
 * Env vars are visible inside the sandbox process, which is what we'd
 * actually use them for later (audit log inside the VM).
 */

export type SandboxTags = { orgId: string; threadId: string };

export type SandboxCreateResult = {
	sandboxId: string;
	/** Snapshot id emitted by Vercel for future resume, if any. */
	persistentId?: string;
};

export interface ISandboxClient {
	create(params: { tags: SandboxTags; timeoutMs?: number }): Promise<SandboxCreateResult>;
	/**
	 * Reconnect to an existing live sandbox. Returns null when the VM is gone
	 * (e.g. crashed / GC'd by Vercel) so the caller can fall back to create.
	 */
	reconnect(sandboxId: string): Promise<{ sandboxId: string } | null>;
	resume(persistentId: string, params: { tags: SandboxTags }): Promise<{ sandboxId: string }>;
	stop(sandboxId: string): Promise<void>;
}

export type SandboxRepoDeps = {
	getByThread: (threadId: Id<"threads">) => Promise<Sandbox | null>;
	registerSandbox: (args: {
		orgId: string;
		threadId: Id<"threads">;
		sandboxId: string;
		persistentId?: string;
		now: number;
	}) => Promise<Id<"sandboxes">>;
	markUsed: (args: { id: Id<"sandboxes">; now: number }) => Promise<void>;
	markDestroyed: (id: Id<"sandboxes">) => Promise<void>;
};

type GetOrCreateArgs = {
	client: ISandboxClient;
	repo: SandboxRepoDeps;
	orgId: string;
	threadId: Id<"threads">;
	now: number;
};

type GetOrCreateResult =
	| { action: "created"; sandboxId: string; rowId: Id<"sandboxes"> }
	| { action: "reused"; sandboxId: string; rowId: Id<"sandboxes"> };

/**
 * Returns the reachable sandbox for a thread, reconnecting to an existing
 * live one or spawning a new one. On reconnect failure (zombie DB row with
 * no underlying VM) we tombstone the stale row before inserting a new one
 * so the 1-per-thread invariant holds.
 */
export async function getOrCreateSandbox(args: GetOrCreateArgs): Promise<GetOrCreateResult> {
	const { client, repo, orgId, threadId, now } = args;
	const existing = await repo.getByThread(threadId);
	const tags: SandboxTags = { orgId, threadId: String(threadId) };

	if (existing && existing.status !== "destroyed") {
		const reconnected = await client.reconnect(existing.sandboxId);
		if (reconnected) {
			await repo.markUsed({ id: existing._id, now });
			return { action: "reused", sandboxId: reconnected.sandboxId, rowId: existing._id };
		}
		// Zombie row — underlying VM is gone. Tombstone before inserting new.
		await repo.markDestroyed(existing._id);
	}

	const created = await client.create({ tags });
	const rowId = await repo.registerSandbox({
		orgId,
		threadId,
		sandboxId: created.sandboxId,
		persistentId: created.persistentId,
		now,
	});
	return { action: "created", sandboxId: created.sandboxId, rowId };
}

type ResumeArgs = {
	client: ISandboxClient;
	repo: SandboxRepoDeps;
	persistentId: string;
	orgId: string;
	threadId: Id<"threads">;
	now: number;
};

/**
 * Spin up a new Vercel sandbox from a previously-snapshotted `persistentId`.
 * A resumed sandbox always gets a fresh `sandboxId` — we persist a new row
 * (the old one should have been tombstoned at stop time).
 */
export async function resumeSandbox(args: ResumeArgs): Promise<GetOrCreateResult> {
	const { client, repo, persistentId, orgId, threadId, now } = args;
	const tags: SandboxTags = { orgId, threadId: String(threadId) };
	const { sandboxId } = await client.resume(persistentId, { tags });
	const rowId = await repo.registerSandbox({
		orgId,
		threadId,
		sandboxId,
		persistentId,
		now,
	});
	return { action: "created", sandboxId, rowId };
}

type DestroyArgs = {
	client: ISandboxClient;
	repo: SandboxRepoDeps;
	row: Sandbox;
};

/**
 * Stop the Vercel sandbox and tombstone the DB row. **Always** tombstones,
 * even if `client.stop` throws — a ghost DB row (points at a VM the user
 * thinks is running) is worse than an orphan VM (Vercel will reap on idle
 * timeout anyway).
 */
export async function destroySandbox(args: DestroyArgs): Promise<void> {
	const { client, repo, row } = args;
	if (row.status === "destroyed") return;
	try {
		await client.stop(row.sandboxId);
	} finally {
		await repo.markDestroyed(row._id);
	}
}

/**
 * Default Vercel-backed client. Reads `VERCEL_SANDBOX_TOKEN` +
 * `VERCEL_TEAM_ID` from the action runtime env. Not invoked in tests —
 * they inject a mock via the service function's `client` arg.
 *
 * `runtime: "python3.13"` is the M2 default: the fizzbuzz smoke (M2-T19)
 * runs a python script. Future agents can parametrize via the wrapper.
 */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export const DefaultSandboxClient: ISandboxClient = {
	create: async ({ tags, timeoutMs }) => {
		const sandbox = await VercelSandbox.create({
			runtime: "python3.13",
			timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
			env: {
				MOM_ORG_ID: tags.orgId,
				MOM_THREAD_ID: tags.threadId,
			},
		});
		return { sandboxId: sandbox.sandboxId };
	},

	reconnect: async (sandboxId) => {
		try {
			const sandbox = await VercelSandbox.get({ sandboxId });
			if (
				sandbox.status === "stopped" ||
				sandbox.status === "stopping" ||
				sandbox.status === "aborted" ||
				sandbox.status === "failed"
			) {
				return null;
			}
			return { sandboxId: sandbox.sandboxId };
		} catch (_err) {
			return null;
		}
	},

	resume: async (persistentId, { tags }) => {
		const sandbox = await VercelSandbox.create({
			source: { type: "snapshot", snapshotId: persistentId },
			timeout: DEFAULT_TIMEOUT_MS,
			env: {
				MOM_ORG_ID: tags.orgId,
				MOM_THREAD_ID: tags.threadId,
			},
		});
		return { sandboxId: sandbox.sandboxId };
	},

	stop: async (sandboxId) => {
		const sandbox = await VercelSandbox.get({ sandboxId });
		await sandbox.stop();
	},
};
