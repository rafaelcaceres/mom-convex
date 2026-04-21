import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";
import { encrypt, generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import type { NewSlackInstall } from "../domain/slackInstall.model";

const ORIGINAL_KEY = process.env.CREDS_MASTER_KEY;

async function seedInstall(overrides: Partial<NewSlackInstall> = {}): Promise<NewSlackInstall> {
	const botTokenEnc = await encrypt("xoxb-secret");
	return {
		orgId: "org_placeholder",
		teamId: "T_SEED",
		teamName: "Seed",
		botTokenEnc,
		scope: "app_mentions:read,chat:write",
		botUserId: "U_BOT",
		...overrides,
	};
}

describe("M1-T14 listInstallsByOrg query", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
	});
	afterEach(() => {
		if (ORIGINAL_KEY === undefined) {
			// biome-ignore lint/performance/noDelete: test isolation
			delete process.env.CREDS_MASTER_KEY;
		} else {
			process.env.CREDS_MASTER_KEY = ORIGINAL_KEY;
		}
	});

	it("rejects unauthenticated callers", async () => {
		const t = newTest();
		await expect(
			t.query(api.slack.queries.listInstallsByOrg.default, { orgId: "org_A" }),
		).rejects.toThrow(/authentication required/i);
	});

	it("rejects non-members of the org", async () => {
		const t = newTest();
		const ownerId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const owner = t.withIdentity({ subject: ownerId });
		const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme",
		});

		const outsiderId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const outsider = t.withIdentity({ subject: outsiderId });
		await expect(
			outsider.query(api.slack.queries.listInstallsByOrg.default, { orgId }),
		).rejects.toThrow(/forbidden/i);
	});

	it("owner sees only this org's installs and never the encrypted token", async () => {
		const t = newTest();
		const ownerId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const owner = t.withIdentity({ subject: ownerId });
		const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme",
		});

		const mine = await seedInstall({ orgId, teamId: "T_MINE", teamName: "Acme WS" });
		const other = await seedInstall({ orgId: "org_other", teamId: "T_OTHER" });
		await t.run(async (ctx) => {
			await ctx.db.insert("slackInstalls", mine);
			await ctx.db.insert("slackInstalls", other);
		});

		const rows = await owner.query(api.slack.queries.listInstallsByOrg.default, { orgId });
		expect(rows).toHaveLength(1);
		expect(rows[0]?.teamId).toBe("T_MINE");
		expect(rows[0]?.teamName).toBe("Acme WS");
		// biome-ignore lint/suspicious/noExplicitAny: asserting absence of a redacted field
		expect((rows[0] as any).botTokenEnc).toBeUndefined();
	});

	it("returns empty array when org has no installs", async () => {
		const t = newTest();
		const ownerId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const owner = t.withIdentity({ subject: ownerId });
		const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme",
		});
		const rows = await owner.query(api.slack.queries.listInstallsByOrg.default, { orgId });
		expect(rows).toEqual([]);
	});
});
