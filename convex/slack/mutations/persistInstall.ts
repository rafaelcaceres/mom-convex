import { v } from "convex/values";
import { encrypt } from "../../_shared/_libs/crypto";
import { internalMutation } from "../../customFunctions";
import { SlackInstallRepository } from "../adapters/slackInstall.repository";

/**
 * Internal mutation called by the OAuth callback httpAction. Encrypts the
 * bot token at rest and upserts by `teamId` (replace semantics on
 * re-install). httpActions run in the Node runtime, mutations in the
 * Convex runtime — splitting the work keeps both simple.
 */
const persistInstall = internalMutation({
	args: {
		orgId: v.string(),
		teamId: v.string(),
		teamName: v.string(),
		botToken: v.string(),
		scope: v.string(),
		botUserId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const botTokenEnc = await encrypt(args.botToken);
		await SlackInstallRepository.upsertByTeamId(ctx, {
			orgId: args.orgId,
			teamId: args.teamId,
			teamName: args.teamName,
			botTokenEnc,
			scope: args.scope,
			botUserId: args.botUserId,
		});
		return null;
	},
});

export default persistInstall;
