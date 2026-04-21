import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";
import { generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import { verifyOAuthState } from "../_libs/oauthState";

const ORIGINAL = {
	key: process.env.CREDS_MASTER_KEY,
	clientId: process.env.SLACK_CLIENT_ID,
	siteUrl: process.env.CONVEX_SITE_URL,
};

describe("M1-T05 createInstallUrl mutation", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
		process.env.SLACK_CLIENT_ID = "test_client";
		process.env.CONVEX_SITE_URL = "https://test.convex.site";
	});
	afterEach(() => {
		for (const [k, v] of Object.entries(ORIGINAL)) {
			const key =
				k === "key" ? "CREDS_MASTER_KEY" : k === "clientId" ? "SLACK_CLIENT_ID" : "CONVEX_SITE_URL";
			if (v === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = v;
			}
		}
	});

	it("rejects unauthenticated callers", async () => {
		const t = newTest();
		await expect(
			t.mutation(api.slack.mutations.createInstallUrl.default, { orgId: "org_A" }),
		).rejects.toThrow(/authentication required/i);
	});

	it("rejects non-owners", async () => {
		const t = newTest();
		const ownerId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const owner = t.withIdentity({ subject: ownerId });
		const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme",
		});

		const outsiderId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const outsider = t.withIdentity({ subject: outsiderId });
		await expect(
			outsider.mutation(api.slack.mutations.createInstallUrl.default, { orgId }),
		).rejects.toThrow(/forbidden/i);
	});

	it("owner receives an authorize URL with client_id, scope, state and redirect_uri", async () => {
		const t = newTest();
		const ownerId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const owner = t.withIdentity({ subject: ownerId });
		const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme",
		});

		const { url } = await owner.mutation(api.slack.mutations.createInstallUrl.default, {
			orgId,
		});

		expect(url.startsWith("https://slack.com/oauth/v2/authorize?")).toBe(true);
		const parsed = new URL(url);
		expect(parsed.searchParams.get("client_id")).toBe("test_client");
		expect(parsed.searchParams.get("scope")).toContain("app_mentions:read");
		expect(parsed.searchParams.get("redirect_uri")).toBe(
			"https://test.convex.site/slack/oauth/callback",
		);
		expect(parsed.searchParams.get("state")?.length).toBeGreaterThan(0);
	});

	it("state round-trips back to the orgId", async () => {
		const t = newTest();
		const ownerId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const owner = t.withIdentity({ subject: ownerId });
		const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme-Z",
		});

		const { url } = await owner.mutation(api.slack.mutations.createInstallUrl.default, {
			orgId,
		});
		const state = new URL(url).searchParams.get("state");
		if (!state) throw new Error("missing state");
		const verified = await verifyOAuthState({ state });
		expect(verified).toEqual({ orgId });
	});

	it("throws when SLACK_CLIENT_ID is unset", async () => {
		// biome-ignore lint/performance/noDelete: test isolation
		delete process.env.SLACK_CLIENT_ID;
		const t = newTest();
		const ownerId = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const owner = t.withIdentity({ subject: ownerId });
		const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
			orgName: "Acme",
		});
		await expect(
			owner.mutation(api.slack.mutations.createInstallUrl.default, { orgId }),
		).rejects.toThrow(/SLACK_CLIENT_ID/);
	});
});
