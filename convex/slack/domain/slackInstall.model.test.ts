import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { encrypt, generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import { type SlackInstall, SlackInstallAgg } from "./slackInstall.model";

const ORIGINAL_KEY = process.env.CREDS_MASTER_KEY;

async function makeAgg(plaintext = "xoxb-SECRET-TOKEN"): Promise<{
	agg: SlackInstallAgg;
	plaintext: string;
}> {
	const enc = await encrypt(plaintext);
	const doc: SlackInstall = {
		_id: "slackInstalls:1" as unknown as Id<"slackInstalls">,
		_creationTime: Date.now(),
		orgId: "org_A",
		teamId: "T123",
		teamName: "Acme",
		botTokenEnc: enc,
		scope: "app_mentions:read,chat:write",
		botUserId: "U_BOT",
	};
	return { agg: new SlackInstallAgg(doc), plaintext };
}

describe("M1-T03 SlackInstallAgg", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
	});
	afterEach(() => {
		if (ORIGINAL_KEY === undefined) {
			// biome-ignore lint/performance/noDelete: unsetting env for test isolation
			delete process.env.CREDS_MASTER_KEY;
		} else {
			process.env.CREDS_MASTER_KEY = ORIGINAL_KEY;
		}
	});

	it("getModel returns the doc", async () => {
		const { agg } = await makeAgg();
		expect(agg.getModel().teamId).toBe("T123");
	});

	it("decryptBotToken returns plaintext", async () => {
		const { agg, plaintext } = await makeAgg("xoxb-my-bot-token");
		await expect(agg.decryptBotToken()).resolves.toBe(plaintext);
	});

	it("getModel().botTokenEnc has only ciphertext shape (no plaintext)", async () => {
		const { agg, plaintext } = await makeAgg("xoxb-marker-42");
		const model = agg.getModel();
		expect(model.botTokenEnc.ciphertextB64).toBeTypeOf("string");
		expect(model.botTokenEnc.nonceB64).toBeTypeOf("string");
		expect(model.botTokenEnc.kid).toBe("v1");
		// Plaintext never appears anywhere in the serialized model.
		expect(JSON.stringify(model)).not.toContain(plaintext);
	});

	it("rotateBotToken re-encrypts with fresh nonce", async () => {
		const { agg } = await makeAgg("old");
		const prevEnc = { ...agg.getModel().botTokenEnc };
		await agg.rotateBotToken("new");
		const nextEnc = agg.getModel().botTokenEnc;
		expect(nextEnc.ciphertextB64).not.toBe(prevEnc.ciphertextB64);
		expect(nextEnc.nonceB64).not.toBe(prevEnc.nonceB64);
		await expect(agg.decryptBotToken()).resolves.toBe("new");
	});
});
