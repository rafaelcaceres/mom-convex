import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { SandboxRepository } from "../adapters/sandbox.repository";
import { SandboxModel } from "../domain/sandbox.model";

/**
 * Active sandboxes whose `lastUsedAt` is strictly older than `now - olderThanMs`.
 * Consumed by the sandbox GC action (M2-T16) via `ctx.runQuery`. `now` is
 * passed in so the action can use a single clock reading across the whole
 * sweep + audit log.
 */
const listIdleInternal = internalQuery({
	args: { olderThanMs: v.number(), now: v.number() },
	returns: v.array(SandboxModel),
	handler: async (ctx, args) => {
		const rows = await SandboxRepository.listIdle(ctx, args);
		return rows.map((r) => r.getModel());
	},
});

export default listIdleInternal;
