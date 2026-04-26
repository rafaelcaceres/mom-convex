import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { SlackInstallRepository } from "../adapters/slackInstall.repository";

/**
 * Internal-only fanout helper for the daily user-cache refresh cron. Returns
 * just the ids — the cron action then schedules a per-install `syncUsers`
 * run, so each workspace's job is isolated.
 *
 * Stays slim (no token / no metadata) to avoid leaking secrets into logs.
 */
const listAllInstallIds = internalQuery({
	args: {},
	returns: v.array(v.object({ _id: v.id("slackInstalls") })),
	handler: async (ctx) => {
		const aggs = await SlackInstallRepository.listAll(ctx);
		return aggs.map((agg) => ({ _id: agg.getModel()._id }));
	},
});

export default listAllInstallIds;
