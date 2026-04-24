import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { SandboxRepository } from "../adapters/sandbox.repository";

/**
 * Insert a newly-spawned sandbox row. Called from sandbox skill impls
 * (M2-T12) after the Vercel client returns a `sandboxId`. `now` is passed
 * in rather than resolved via `Date.now()` here so the caller can reuse
 * the same timestamp for `createdAt` + `lastUsedAt` and align with the
 * action's audit log.
 */
const registerSandbox = internalMutation({
	args: {
		orgId: v.string(),
		threadId: v.id("threads"),
		sandboxId: v.string(),
		persistentId: v.optional(v.string()),
		now: v.number(),
	},
	returns: v.id("sandboxes"),
	handler: async (ctx, args) => {
		const agg = await SandboxRepository.create(ctx, {
			orgId: args.orgId,
			threadId: args.threadId,
			provider: "vercel",
			sandboxId: args.sandboxId,
			persistentId: args.persistentId,
			status: "active",
			createdAt: args.now,
			lastUsedAt: args.now,
		});
		return agg.getModel()._id;
	},
});

export default registerSandbox;
