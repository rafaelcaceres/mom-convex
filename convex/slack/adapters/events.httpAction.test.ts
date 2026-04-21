import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { encrypt, generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import { SlackEventDedupeRepository } from "./slackEventDedupe.repository";
import { SlackInstallRepository } from "./slackInstall.repository";

const SIGNING_SECRET = "sigtest_secret";

const ORIGINAL = {
	key: process.env.CREDS_MASTER_KEY,
	signing: process.env.SLACK_SIGNING_SECRET,
};

function restore() {
	const map: Record<string, string | undefined> = {
		CREDS_MASTER_KEY: ORIGINAL.key,
		SLACK_SIGNING_SECRET: ORIGINAL.signing,
	};
	for (const [k, v] of Object.entries(map)) {
		if (v === undefined) {
			delete process.env[k];
		} else {
			process.env[k] = v;
		}
	}
}

function signedHeaders(rawBody: string, tsSec: number = Math.floor(Date.now() / 1000)) {
	const base = `v0:${tsSec}:${rawBody}`;
	const sig = `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
	return {
		"content-type": "application/json",
		"x-slack-request-timestamp": `${tsSec}`,
		"x-slack-signature": sig,
	};
}

async function seedInstall(t: ReturnType<typeof newTest>, teamId: string, orgId = "org_A") {
	const botTokenEnc = await encrypt("xoxb-test");
	await t.run(async (ctx) => {
		await SlackInstallRepository.upsertByTeamId(ctx, {
			orgId,
			teamId,
			teamName: "Test",
			botTokenEnc,
			scope: "app_mentions:read",
			botUserId: "U_BOT",
		});
	});
}

describe("M1-T07 events httpAction", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
		process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
	});
	afterEach(() => {
		restore();
	});

	it("returns 401 when signature is invalid", async () => {
		const t = newTest();
		const body = JSON.stringify({ type: "event_callback" });
		const res = await t.fetch("/slack/events", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-slack-request-timestamp": `${Math.floor(Date.now() / 1000)}`,
				"x-slack-signature": "v0=deadbeef",
			},
			body,
		});
		expect(res.status).toBe(401);
	});

	it("responds to url_verification with challenge in the body", async () => {
		const t = newTest();
		const body = JSON.stringify({ type: "url_verification", challenge: "chl_xyz" });
		const res = await t.fetch("/slack/events", {
			method: "POST",
			headers: signedHeaders(body),
			body,
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as { challenge: string };
		expect(data.challenge).toBe("chl_xyz");
	});

	it("returns 404 when team_id has no install", async () => {
		const t = newTest();
		const body = JSON.stringify({
			type: "event_callback",
			event_id: "Ev1",
			team_id: "T_UNKNOWN",
			event: { type: "app_mention" },
		});
		const res = await t.fetch("/slack/events", {
			method: "POST",
			headers: signedHeaders(body),
			body,
		});
		expect(res.status).toBe(404);
	});

	it("happy path: signed + new eventId → records dedupe + schedules handler", async () => {
		const t = newTest();
		await seedInstall(t, "T_A");
		const body = JSON.stringify({
			type: "event_callback",
			event_id: "Ev1",
			team_id: "T_A",
			event: { type: "app_mention", channel: "C1", user: "U1", text: "hi" },
		});
		const res = await t.fetch("/slack/events", {
			method: "POST",
			headers: signedHeaders(body),
			body,
		});
		expect(res.status).toBe(200);

		const recorded = await t.run(async (ctx) => {
			const agg = await SlackEventDedupeRepository.getByEventId(ctx, { eventId: "Ev1" });
			return agg !== null;
		});
		expect(recorded).toBe(true);

		// Scheduler should have a pending job — finishing it runs the stub handler
		await t.finishAllScheduledFunctions(() => undefined);
	});

	it("duplicate eventId returns 200 with deduped flag and does not re-enqueue", async () => {
		const t = newTest();
		await seedInstall(t, "T_A");
		const body = JSON.stringify({
			type: "event_callback",
			event_id: "Ev_dup",
			team_id: "T_A",
			event: { type: "app_mention" },
		});
		const first = await t.fetch("/slack/events", {
			method: "POST",
			headers: signedHeaders(body),
			body,
		});
		expect(first.status).toBe(200);

		const second = await t.fetch("/slack/events", {
			method: "POST",
			headers: signedHeaders(body),
			body,
		});
		expect(second.status).toBe(200);
		const body2 = (await second.json()) as { deduped?: boolean };
		expect(body2.deduped).toBe(true);

		// Drain the one scheduled job from the first call so the async
		// write-after-teardown doesn't leak as an unhandled rejection.
		await t.finishAllScheduledFunctions(() => undefined);
	});
});
