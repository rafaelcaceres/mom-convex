import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { SandboxRepository } from "../adapters/sandbox.repository";

/**
 * Tombstone a sandbox row. Used in two paths:
 *   - the reconnect-failed branch of `getOrCreateSandbox` (zombie row
 *     whose Vercel VM is gone);
 *   - explicit destroy flows (GC cron, user action).
 * Idempotent via the repo helper (already-destroyed rows are a no-op).
 */
const markDestroyedInternal = internalMutation({
	args: { id: v.id("sandboxes") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await SandboxRepository.markDestroyed(ctx, args.id);
		return null;
	},
});

export default markDestroyedInternal;
