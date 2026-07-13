import type { QueryCtx } from "../../_generated/server";
import { createRepository } from "../../_shared/_libs/repository";
import { EventAgg } from "../domain/event.model";
import type { IEventRepository } from "../domain/event.repository";

/**
 * Upper bound on a single `listReady` sweep. The sweeper reconciles lost jobs;
 * it is not a work queue, so a bound that fits comfortably in one transaction is
 * the right shape. A backlog larger than this drains across successive runs
 * rather than blowing the read limit in one.
 */
const MAX_READY_PER_SWEEP = 100;

export const EventRepository: IEventRepository = {
	...createRepository("events", (doc) => new EventAgg(doc)),

	listByAgent: async (ctx, agentId) => {
		const docs = await ctx.db
			.query("events")
			.withIndex("by_agent", (q) => q.eq("agentId", agentId))
			.order("desc")
			.collect();
		return docs.map((doc) => new EventAgg(doc));
	},

	listActiveByOrg: async (ctx, orgId) => {
		const docs = await ctx.db
			.query("events")
			.withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "scheduled"))
			.collect();
		return docs.map((doc) => new EventAgg(doc));
	},

	listReady: async (ctx: QueryCtx, now, limit) => {
		// `by_next_run` is keyed on `status` first so this is a range scan over live
		// events only — a table full of `done` one-shots (the steady state, after a
		// few months) never gets walked. `nextRunAt` is cleared on cancel/done, so
		// dead rows are absent from the index range regardless.
		const docs = await ctx.db
			.query("events")
			.withIndex("by_next_run", (q) => q.eq("status", "scheduled").lte("nextRunAt", now))
			.take(limit ?? MAX_READY_PER_SWEEP);
		return docs.map((doc) => new EventAgg(doc));
	},
};
