import { v } from "convex/values";
import { internalMutation } from "../../customFunctions";
import { SlackEventDedupeRepository } from "../adapters/slackEventDedupe.repository";
import { DEFAULT_DEDUPE_TTL_MS } from "../domain/slackEventDedupe.model";

/**
 * Hourly cron (see convex/crons.ts). Deletes dedupe rows older than
 * `DEFAULT_DEDUPE_TTL_MS`. Bounded to `batchSize=500` per run; if more remain,
 * the next hour's cron sweeps them.
 */
const cleanExpiredDedupe = internalMutation({
	args: {},
	returns: v.object({ deleted: v.number() }),
	handler: async (ctx) => {
		const deleted = await SlackEventDedupeRepository.clearExpired(ctx, {
			now: Date.now(),
			ttlMs: DEFAULT_DEDUPE_TTL_MS,
		});
		return { deleted };
	},
});

export default cleanExpiredDedupe;
