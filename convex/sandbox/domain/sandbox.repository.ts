import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { SandboxAgg } from "./sandbox.model";

export interface ISandboxRepository extends IRepository<"sandboxes", SandboxAgg> {
	/**
	 * The one live (`active` or `stopped`) sandbox for a thread, or null. Hides
	 * destroyed rows — callers always want the reachable one.
	 */
	getByThread(ctx: QueryCtx, threadId: Id<"threads">): Promise<SandboxAgg | null>;

	/**
	 * Load → bump `lastUsedAt` to `now` → save. Rejects destroyed rows via the
	 * aggregate invariant.
	 */
	markUsed(ctx: MutationCtx, id: Id<"sandboxes">, now: number): Promise<void>;

	/**
	 * Load → flip status to `destroyed` → save. Idempotent: already-destroyed
	 * rows are a no-op.
	 */
	markDestroyed(ctx: MutationCtx, id: Id<"sandboxes">): Promise<void>;

	/**
	 * Active sandboxes whose `lastUsedAt` is more than `olderThanMs` before
	 * `now`. Consumed by the GC cron (M2-T16). Stopped sandboxes are excluded
	 * — they're already snapshot-suspended and cheap to leave alone; the
	 * caller can opt into a broader sweep later if the cost story changes.
	 */
	listIdle(ctx: QueryCtx, args: { olderThanMs: number; now: number }): Promise<SandboxAgg[]>;
}
