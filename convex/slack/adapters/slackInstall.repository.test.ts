import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { encrypt, generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import type { NewSlackInstall } from "../domain/slackInstall.model";
import { SlackInstallRepository } from "./slackInstall.repository";

const ORIGINAL_KEY = process.env.CREDS_MASTER_KEY;

async function makeNewInstall(
	overrides: Partial<NewSlackInstall> = {},
	plaintext = "xoxb-real-bot-token",
): Promise<{ data: NewSlackInstall; plaintext: string }> {
	const botTokenEnc = await encrypt(plaintext);
	return {
		data: {
			orgId: "org_A",
			teamId: "T123",
			teamName: "Acme",
			botTokenEnc,
			scope: "app_mentions:read,chat:write",
			botUserId: "U_BOT",
			...overrides,
		},
		plaintext,
	};
}

describe("M1-T03 SlackInstallRepository", () => {
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

	it("upsertByTeamId creates on first call", async () => {
		const t = newTest();
		const { data } = await makeNewInstall();
		const got = await t.run(async (ctx) => {
			const agg = await SlackInstallRepository.upsertByTeamId(ctx, data);
			return agg.getModel();
		});
		expect(got.teamId).toBe("T123");
		expect(got.teamName).toBe("Acme");
	});

	it("upsertByTeamId updates existing row (same teamId)", async () => {
		const t = newTest();
		const first = await makeNewInstall({ teamName: "Old Name" }, "xoxb-v1");
		await t.run(async (ctx) => {
			await SlackInstallRepository.upsertByTeamId(ctx, first.data);
		});

		const second = await makeNewInstall({ teamName: "New Name" }, "xoxb-v2");
		await t.run(async (ctx) => {
			await SlackInstallRepository.upsertByTeamId(ctx, second.data);
		});

		const rows = await t.run(async (ctx) => {
			const aggs = await SlackInstallRepository.listByOrg(ctx, { orgId: "org_A" });
			return aggs.map((a) => a.getModel());
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.teamName).toBe("New Name");
	});

	it("getByTeamId hit + miss", async () => {
		const t = newTest();
		const { data } = await makeNewInstall();
		await t.run(async (ctx) => {
			await SlackInstallRepository.upsertByTeamId(ctx, data);
		});

		const hit = await t.run(async (ctx) => {
			const agg = await SlackInstallRepository.getByTeamId(ctx, { teamId: "T123" });
			return agg?.getModel() ?? null;
		});
		expect(hit?.teamId).toBe("T123");

		const miss = await t.run(async (ctx) => {
			const agg = await SlackInstallRepository.getByTeamId(ctx, { teamId: "T_NONE" });
			return agg?.getModel() ?? null;
		});
		expect(miss).toBeNull();
	});

	it("stored row does NOT contain the plaintext bot token", async () => {
		const t = newTest();
		const { data, plaintext } = await makeNewInstall({}, "xoxb-marker-secret-42");
		const doc = await t.run(async (ctx) => {
			const agg = await SlackInstallRepository.upsertByTeamId(ctx, data);
			return agg.getModel();
		});
		expect(JSON.stringify(doc)).not.toContain(plaintext);
	});

	it("listByOrg scopes correctly (no cross-org leak)", async () => {
		const t = newTest();
		const a = await makeNewInstall({ orgId: "org_A", teamId: "T_A" });
		const b = await makeNewInstall({ orgId: "org_B", teamId: "T_B" });
		await t.run(async (ctx) => {
			await SlackInstallRepository.upsertByTeamId(ctx, a.data);
			await SlackInstallRepository.upsertByTeamId(ctx, b.data);
		});

		const onlyA = await t.run(async (ctx) => {
			const aggs = await SlackInstallRepository.listByOrg(ctx, { orgId: "org_A" });
			return aggs.map((agg) => agg.getModel().teamId);
		});
		expect(onlyA).toEqual(["T_A"]);
	});
});
