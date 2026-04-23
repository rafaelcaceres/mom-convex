import { createRepository } from "../../_shared/_libs/repository";
import { SandboxAgg } from "../domain/sandbox.model";
import type { ISandboxRepository } from "../domain/sandbox.repository";

export const SandboxRepository: ISandboxRepository = {
	...createRepository("sandboxes", (doc) => new SandboxAgg(doc)),

	getByThread: async (ctx, threadId) => {
		const docs = await ctx.db
			.query("sandboxes")
			.withIndex("by_thread", (q) => q.eq("threadId", threadId))
			.collect();
		const reachable = docs.find((d) => d.status !== "destroyed");
		return reachable ? new SandboxAgg(reachable) : null;
	},

	markUsed: async (ctx, id, now) => {
		const agg = await SandboxRepository.get(ctx, id);
		if (!agg) throw new Error(`Sandbox not found: ${id}`);
		agg.markUsed(now);
		await SandboxRepository.save(ctx, agg);
	},

	markDestroyed: async (ctx, id) => {
		const agg = await SandboxRepository.get(ctx, id);
		if (!agg) throw new Error(`Sandbox not found: ${id}`);
		if (agg.getModel().status === "destroyed") return;
		agg.markDestroyed();
		await SandboxRepository.save(ctx, agg);
	},

	listIdle: async (ctx, { olderThanMs, now }) => {
		const threshold = now - olderThanMs;
		const docs = await ctx.db
			.query("sandboxes")
			.withIndex("by_status_lastUsedAt", (q) =>
				q.eq("status", "active").lt("lastUsedAt", threshold),
			)
			.collect();
		return docs.map((doc) => new SandboxAgg(doc));
	},
};
