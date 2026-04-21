import { v } from "convex/values";
import { requireOrgRole } from "../../auth.utils";
import { query } from "../../customFunctions";
import { SlackInstallRepository } from "../adapters/slackInstall.repository";
import { SlackInstallPublicModel } from "../domain/slackInstall.model";

/**
 * Lists Slack installs for `/settings/slack`. Owner-only — non-owners are
 * rejected so the UI can translate that into a clear "access denied" state
 * without leaking the existence of an install.
 *
 * Redacts `botTokenEnc`: the encrypted blob never crosses the wire.
 */
const listInstallsByOrg = query({
	args: { orgId: v.string() },
	returns: v.array(SlackInstallPublicModel),
	handler: async (ctx, args) => {
		await requireOrgRole(ctx, args.orgId, "owner");
		const aggs = await SlackInstallRepository.listByOrg(ctx, { orgId: args.orgId });
		return aggs.map((a) => {
			const { botTokenEnc: _redacted, ...safe } = a.getModel();
			return safe;
		});
	},
});

export default listInstallsByOrg;
