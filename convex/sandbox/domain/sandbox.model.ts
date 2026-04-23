import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";

/**
 * One row per live Vercel sandbox instance owned by a thread. Without this
 * bookkeeping, every `sandbox.*` skill call would spawn a new sandbox (and
 * the user would pay for the cold-start dance every turn).
 *
 *  - `active`    — sandbox is running; `sandbox.*` tools attach to it.
 *  - `stopped`   — sandbox has been suspended via persistent-disk snapshot;
 *                  `persistentId` holds the snapshot ref used to re-attach.
 *  - `destroyed` — tombstone. Kept so `getByThread` can distinguish "never
 *                  had one" from "had one, finished with it"; also so the
 *                  GC cron (M2-T16) has audit trail of what it killed.
 *
 * Invariant: at most one non-destroyed sandbox per `threadId`. Enforced at
 * the mutation/wrapper layer (M2-T11) — this domain doesn't own write paths
 * beyond the mutators below.
 *
 * `orgId` is denormalized from the parent thread so tenant-scoped queries
 * and authz checks don't need a JOIN. Sandboxes don't move across orgs.
 */

export const SandboxStatusModel = v.union(
	v.literal("active"),
	v.literal("stopped"),
	v.literal("destroyed"),
);

/**
 * Provider union — today only Vercel Sandbox (M2-T11 wrapper). Kept as a
 * union so swapping in E2B or a self-hosted runner later is an additive
 * change instead of a schema migration.
 */
export const SandboxProviderModel = v.union(v.literal("vercel"));

export const NewSandboxModel = v.object({
	orgId: v.string(),
	threadId: v.id("threads"),
	provider: SandboxProviderModel,
	sandboxId: v.string(),
	persistentId: v.optional(v.string()),
	status: SandboxStatusModel,
	createdAt: v.number(),
	lastUsedAt: v.number(),
});

export const SandboxModel = v.object({
	_id: v.id("sandboxes"),
	_creationTime: v.number(),
	...NewSandboxModel.fields,
});

export type SandboxStatus = Infer<typeof SandboxStatusModel>;
export type SandboxProvider = Infer<typeof SandboxProviderModel>;
export type NewSandbox = Infer<typeof NewSandboxModel>;
export type Sandbox = Infer<typeof SandboxModel>;

export class SandboxAgg implements IAggregate<Sandbox> {
	constructor(private readonly sandbox: Sandbox) {}

	getModel(): Sandbox {
		return this.sandbox;
	}

	markUsed(now: number): void {
		if (this.sandbox.status === "destroyed") {
			throw new Error("Cannot mark a destroyed sandbox as used");
		}
		this.sandbox.lastUsedAt = now;
	}

	markStopped(): void {
		if (this.sandbox.status === "destroyed") {
			throw new Error("Cannot stop a destroyed sandbox");
		}
		this.sandbox.status = "stopped";
	}

	markDestroyed(): void {
		this.sandbox.status = "destroyed";
	}

	/**
	 * True when the sandbox is still reachable (not destroyed) and has been
	 * idle for strictly longer than `maxIdleMs`. Used by the GC cron
	 * (M2-T16) — destroyed rows return `false` so we don't re-kill them.
	 */
	isExpired(maxIdleMs: number, now: number): boolean {
		if (this.sandbox.status === "destroyed") return false;
		return now - this.sandbox.lastUsedAt > maxIdleMs;
	}
}
