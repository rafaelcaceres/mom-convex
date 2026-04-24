import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { SandboxRepository } from "../adapters/sandbox.repository";

/**
 * Bump `lastUsedAt` on a reused sandbox so the GC cron (M2-T16) doesn't
 * kill a sandbox the agent is actively working in. Wraps `SandboxRepository.markUsed`
 * so skill impls running in actions can update state via `ctx.runMutation`.
 */
const markUsedInternal = internalMutation({
	args: {
		id: v.id("sandboxes"),
		now: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await SandboxRepository.markUsed(ctx, args.id, args.now);
		return null;
	},
});

export default markUsedInternal;
