import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { SlackInstallRepository } from "../adapters/slackInstall.repository";
import { SlackInstallModel } from "../domain/slackInstall.model";

/**
 * Internal-only install fetch by id. Used by `handleIncomingEvent` to pick up
 * the bot's own user id (for mention resolution) after the events httpAction
 * has already resolved the install from `team_id`.
 */
const getInstallById = internalQuery({
	args: { installId: v.id("slackInstalls") },
	returns: v.union(SlackInstallModel, v.null()),
	handler: async (ctx, args) => {
		const agg = await SlackInstallRepository.get(ctx, args.installId);
		return agg?.getModel() ?? null;
	},
});

export default getInstallById;
