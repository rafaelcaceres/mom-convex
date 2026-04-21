import { v } from "convex/values";
import { internalQuery } from "../../customFunctions";
import { SlackInstallRepository } from "../adapters/slackInstall.repository";

/**
 * Internal-only query used by the events httpAction to look up which org
 * owns a given Slack workspace. Returns `null` if we don't have an install
 * for that `teamId` — the httpAction turns that into a 404.
 */
const resolveInstallByTeamId = internalQuery({
	args: { teamId: v.string() },
	returns: v.union(
		v.object({
			installId: v.id("slackInstalls"),
			orgId: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const agg = await SlackInstallRepository.getByTeamId(ctx, { teamId: args.teamId });
		if (!agg) return null;
		const model = agg.getModel();
		return { installId: model._id, orgId: model.orgId };
	},
});

export default resolveInstallByTeamId;
