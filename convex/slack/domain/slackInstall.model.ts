import { type Infer, v } from "convex/values";
import type { IAggregate } from "../../_shared/_libs/aggregate";
import { decrypt, encrypt } from "../../_shared/_libs/crypto";

/**
 * Slack workspace install. Bot token is **always** encrypted at rest — only
 * the aggregate's `decryptBotToken()` reveals plaintext, and only inside
 * adapter actions that actually need to call Slack's Web API. The raw doc
 * returned from queries contains just ciphertext.
 */

export const EncryptedBlobModel = v.object({
	ciphertextB64: v.string(),
	nonceB64: v.string(),
	kid: v.string(),
});

export const NewSlackInstallModel = v.object({
	orgId: v.string(),
	teamId: v.string(),
	teamName: v.string(),
	botTokenEnc: EncryptedBlobModel,
	scope: v.string(),
	botUserId: v.string(),
});

export const SlackInstallModel = v.object({
	_id: v.id("slackInstalls"),
	_creationTime: v.number(),
	...NewSlackInstallModel.fields,
});

/**
 * Safe-to-return view for user-facing queries — strips the encrypted token
 * blob so it never crosses the wire, even encrypted. UI only needs workspace
 * identity (team name, scope) for the "Connected" card.
 */
export const SlackInstallPublicModel = SlackInstallModel.omit("botTokenEnc");

export type NewSlackInstall = Infer<typeof NewSlackInstallModel>;
export type SlackInstall = Infer<typeof SlackInstallModel>;
export type SlackInstallPublic = Infer<typeof SlackInstallPublicModel>;

export class SlackInstallAgg implements IAggregate<SlackInstall> {
	constructor(private readonly install: SlackInstall) {}

	getModel(): SlackInstall {
		return this.install;
	}

	async decryptBotToken(): Promise<string> {
		return decrypt(this.install.botTokenEnc);
	}

	async rotateBotToken(plaintext: string): Promise<void> {
		this.install.botTokenEnc = await encrypt(plaintext);
	}
}
