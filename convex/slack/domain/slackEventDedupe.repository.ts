import type { MutationCtx, QueryCtx } from "../../_generated/server";
import type { IRepository } from "../../_shared/_libs/repository";
import type { SlackEventDedupe, SlackEventDedupeAgg } from "./slackEventDedupe.model";

export type RecordResult = "recorded" | "duplicate";

export interface ISlackEventDedupeRepository
	extends IRepository<"slackEventDedupe", SlackEventDedupeAgg> {
	getByEventId(
		ctx: QueryCtx,
		clause: { eventId: SlackEventDedupe["eventId"] },
	): Promise<SlackEventDedupeAgg | null>;

	/**
	 * Atomic record-or-skip. Returns `"recorded"` on first insert, `"duplicate"`
	 * if another write already claimed the same `eventId`.
	 */
	recordOrSkip(
		ctx: MutationCtx,
		clause: { eventId: SlackEventDedupe["eventId"]; now: number },
	): Promise<RecordResult>;

	/**
	 * Delete dedupe rows whose `seenAt` is older than `now - ttlMs`.
	 * Returns count deleted. Paginates to stay inside mutation limits.
	 */
	clearExpired(
		ctx: MutationCtx,
		clause: { now: number; ttlMs: number; batchSize?: number },
	): Promise<number>;
}
