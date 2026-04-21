import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { server } from "../../../test/_helpers/msw";
import { generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import { signOAuthState } from "../_libs/oauthState";
import { SlackInstallRepository } from "./slackInstall.repository";

const ORIGINAL = {
	key: process.env.CREDS_MASTER_KEY,
	clientId: process.env.SLACK_CLIENT_ID,
	clientSecret: process.env.SLACK_CLIENT_SECRET,
	convexSiteUrl: process.env.CONVEX_SITE_URL,
	siteUrl: process.env.SITE_URL,
};

function restore() {
	const map: Record<string, string | undefined> = {
		CREDS_MASTER_KEY: ORIGINAL.key,
		SLACK_CLIENT_ID: ORIGINAL.clientId,
		SLACK_CLIENT_SECRET: ORIGINAL.clientSecret,
		CONVEX_SITE_URL: ORIGINAL.convexSiteUrl,
		SITE_URL: ORIGINAL.siteUrl,
	};
	for (const [k, v] of Object.entries(map)) {
		if (v === undefined) {
			delete process.env[k];
		} else {
			process.env[k] = v;
		}
	}
}

function mockOauthAccessOk() {
	server.use(
		http.post("https://slack.com/api/oauth.v2.access", () =>
			HttpResponse.json({
				ok: true,
				access_token: "xoxb-from-test",
				scope: "app_mentions:read,chat:write",
				bot_user_id: "U_BOT",
				team: { id: "T_123", name: "Acme Workspace" },
			}),
		),
	);
}

function mockOauthAccessError(error: string) {
	server.use(
		http.post("https://slack.com/api/oauth.v2.access", () =>
			HttpResponse.json({ ok: false, error }),
		),
	);
}

describe("M1-T05 oauthCallback httpAction", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
		process.env.SLACK_CLIENT_ID = "test_client";
		process.env.SLACK_CLIENT_SECRET = "test_secret";
		process.env.CONVEX_SITE_URL = "https://test.convex.site";
		process.env.SITE_URL = "https://app.test";
	});
	afterEach(() => {
		restore();
	});

	it("redirects with status=invalid_state when state is missing", async () => {
		const t = newTest();
		const res = await t.fetch("/slack/oauth/callback?code=abc");
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toMatch(/status=missing_params/);
	});

	it("redirects with status=invalid_state when state is tampered", async () => {
		const t = newTest();
		const res = await t.fetch("/slack/oauth/callback?code=abc&state=garbage.here.now.xyz");
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toMatch(/status=invalid_state/);
	});

	it("redirects with status=<error> when Slack returns an OAuth error", async () => {
		mockOauthAccessError("invalid_code");
		const t = newTest();
		const state = await signOAuthState({ orgId: "org_A" });
		const res = await t.fetch(`/slack/oauth/callback?code=xxx&state=${encodeURIComponent(state)}`);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toMatch(/status=invalid_code/);
	});

	it("happy path: exchanges code, persists encrypted install, redirects status=ok", async () => {
		mockOauthAccessOk();
		const t = newTest();
		const state = await signOAuthState({ orgId: "org_A" });
		const res = await t.fetch(
			`/slack/oauth/callback?code=valid&state=${encodeURIComponent(state)}`,
		);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toMatch(/status=ok/);

		const doc = await t.run(async (ctx) => {
			const agg = await SlackInstallRepository.getByTeamId(ctx, { teamId: "T_123" });
			return agg?.getModel() ?? null;
		});
		expect(doc?.orgId).toBe("org_A");
		expect(doc?.teamName).toBe("Acme Workspace");
		expect(doc?.botUserId).toBe("U_BOT");
		// Token is at-rest encrypted — plaintext must not appear in the doc.
		expect(JSON.stringify(doc)).not.toContain("xoxb-from-test");
	});

	it("re-install (same teamId) upserts — only one row persists", async () => {
		mockOauthAccessOk();
		const t = newTest();
		const state = await signOAuthState({ orgId: "org_A" });
		await t.fetch(`/slack/oauth/callback?code=c1&state=${encodeURIComponent(state)}`);
		await t.fetch(`/slack/oauth/callback?code=c2&state=${encodeURIComponent(state)}`);

		const rows = await t.run(async (ctx) => {
			const aggs = await SlackInstallRepository.listByOrg(ctx, { orgId: "org_A" });
			return aggs.map((a) => a.getModel());
		});
		expect(rows).toHaveLength(1);
	});
});
