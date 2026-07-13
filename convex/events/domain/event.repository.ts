import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { EventAgg } from "./event.model";

export interface IEventRepository extends IRepository<"events", EventAgg> {
	/**
	 * Every event owned by an agent, newest first — including cancelled and done
	 * ones, because this backs the UI list (M4-T04) and "the reminder I cancelled
	 * yesterday" is exactly what a user goes looking for.
	 */
	listByAgent(ctx: QueryCtx, agentId: Id<"agents">): Promise<EventAgg[]>;

	/** Live events for an org. Powers the org-wide view and the multi-agent overview. */
	listActiveByOrg(ctx: QueryCtx, orgId: string): Promise<EventAgg[]>;

	/**
	 * Events that are live and whose `nextRunAt` has come and gone.
	 *
	 * This is a **safety net, not the delivery path**. Events fire because
	 * `ctx.scheduler` / the cron registry says so (M4-T03); nothing polls this in
	 * the hot path. It exists because a scheduled job can be lost — a deploy
	 * mid-flight, a crashed action, a cancel that raced a retry — and a reminder
	 * that silently never arrives is the one failure mode this feature cannot
	 * have. A sweeper (M4-T03) reconciles against it.
	 */
	listReady(ctx: QueryCtx, now: number, limit?: number): Promise<EventAgg[]>;
}
