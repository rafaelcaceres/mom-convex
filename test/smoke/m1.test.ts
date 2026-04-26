import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { encrypt, generateMasterKeyBase64 } from "../../convex/_shared/_libs/crypto";
import {
	_clearAgentCache,
	_setLanguageModelOverride,
} from "../../convex/agents/_libs/agentFactory";
import { newTest } from "../_helpers/convex";
import { mockEchoModel } from "../_helpers/mockLanguageModel";
import { http, HttpResponse, server } from "../_helpers/msw";

const SIGNING_SECRET = "smoke_sigtest_secret";

const ORIGINAL_ENV = {
	key: process.env.CREDS_MASTER_KEY,
	signing: process.env.SLACK_SIGNING_SECRET,
};

function restoreEnv() {
	const map: Record<string, string | undefined> = {
		CREDS_MASTER_KEY: ORIGINAL_ENV.key,
		SLACK_SIGNING_SECRET: ORIGINAL_ENV.signing,
	};
	for (const [k, v] of Object.entries(map)) {
		if (v === undefined) {
			delete process.env[k];
		} else {
			process.env[k] = v;
		}
	}
}

/**
 * Slack signing uses the request timestamp against ±5min. Under
 * `vi.useFakeTimers()` `Date.now()` is frozen — pass an explicit real-time
 * value so the server-side window check keeps passing.
 */
function signedHeaders(rawBody: string, tsSec = Math.floor(realNow() / 1000)) {
	const base = `v0:${tsSec}:${rawBody}`;
	const sig = `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
	return {
		"content-type": "application/json",
		"x-slack-request-timestamp": `${tsSec}`,
		"x-slack-signature": sig,
	};
}

/** Real wall-clock even when vitest fake timers are installed. */
function realNow(): number {
	const now = Date.now.bind(Date);
	// `vi.useFakeTimers` swaps Date; `performance.timeOrigin + performance.now()` stays real.
	return typeof performance !== "undefined" && performance.timeOrigin
		? performance.timeOrigin + performance.now()
		: now();
}

function agentArgs(orgId: string) {
	return {
		orgId,
		slug: "default",
		name: "Default",
		systemPrompt: "You are mom.",
		modelId: "claude-sonnet-4-5",
		modelProvider: "anthropic",
	};
}

async function seedUser(t: ReturnType<typeof newTest>) {
	return t.run(async (ctx) => ctx.db.insert("users", {}));
}

async function seedOrgWithAgent(t: ReturnType<typeof newTest>, orgId: string) {
	const userId = await seedUser(t);
	const caller = t.withIdentity({ subject: userId });
	await caller.mutation(api.agents.mutations.createAgent.default, agentArgs(orgId));
	return { userId, caller };
}

async function seedSlackInstall(
	t: ReturnType<typeof newTest>,
	orgId: string,
	teamId: string,
	botUserId = "UBOT",
) {
	const botTokenEnc = await encrypt("xoxb-smoke");
	return t.run(async (ctx) =>
		ctx.db.insert("slackInstalls", {
			orgId,
			teamId,
			teamName: `Team-${teamId}`,
			botTokenEnc,
			scope: "app_mentions:read,chat:write",
			botUserId,
		}),
	);
}

describe("M1-T15 smoke: end-to-end echo loop + cross-tenant isolation", () => {
	beforeEach(() => {
		// Fake timers are required for `t.finishAllScheduledFunctions(vi.runAllTimers)`
		// to actually drain the Convex scheduler. `toFake` keeps `performance.now` and
		// `nextTick` on real time so MSW handlers and async I/O aren't stalled.
		vi.useFakeTimers({
			toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
		});
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
		process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
		_clearAgentCache();
		_setLanguageModelOverride(mockEchoModel());
	});
	afterEach(() => {
		vi.useRealTimers();
		restoreEnv();
		_setLanguageModelOverride(null);
		_clearAgentCache();
	});

	it("web chat: user A's echo is visible to user A, user B's thread stays empty", async () => {
		const t = newTest();
		const { caller: callerA } = await seedOrgWithAgent(t, "org_A");
		const threadA = await callerA.mutation(api.webChat.mutations.createThread.default, {
			orgId: "org_A",
		});
		const { caller: callerB } = await seedOrgWithAgent(t, "org_B");
		const threadB = await callerB.mutation(api.webChat.mutations.createThread.default, {
			orgId: "org_B",
		});

		await callerA.mutation(api.webChat.mutations.sendMessage.default, {
			threadId: threadA,
			text: "oi",
		});
		await t.finishAllScheduledFunctions(vi.runAllTimers);

		const rowsA = await callerA.query(api.webChat.queries.listMessages.default, {
			threadId: threadA,
		});
		expect(rowsA.map((r) => ({ role: r.role, text: r.text }))).toEqual([
			{ role: "user", text: "oi" },
			{ role: "assistant", text: "echo: oi" },
		]);

		const rowsB = await callerB.query(api.webChat.queries.listMessages.default, {
			threadId: threadB,
		});
		expect(rowsB).toEqual([]);
	});

	it("cross-tenant: user B cannot read or write on user A's thread", async () => {
		const t = newTest();
		const { caller: callerA } = await seedOrgWithAgent(t, "org_A");
		const threadA = await callerA.mutation(api.webChat.mutations.createThread.default, {
			orgId: "org_A",
		});

		const { caller: callerB } = await seedOrgWithAgent(t, "org_B");

		await expect(
			callerB.query(api.webChat.queries.listMessages.default, { threadId: threadA }),
		).rejects.toThrow(/Forbidden/);

		await expect(
			callerB.mutation(api.webChat.mutations.sendMessage.default, {
				threadId: threadA,
				text: "leak",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("slack echo: app_mention → live-painted reply, thread_ts preserved, final text via chat.update", async () => {
		const t = newTest();
		await seedOrgWithAgent(t, "org_A");
		await seedSlackInstall(t, "org_A", "T_A", "UBOT");

		const posted: Array<Record<string, unknown>> = [];
		const updated: Array<Record<string, unknown>> = [];
		server.use(
			http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
				const body = (await request.json()) as Record<string, unknown>;
				posted.push(body);
				return HttpResponse.json({ ok: true, channel: body.channel, ts: "9.9" });
			}),
			http.post("https://slack.com/api/chat.update", async ({ request }) => {
				const body = (await request.json()) as Record<string, unknown>;
				updated.push(body);
				return HttpResponse.json({ ok: true, channel: body.channel, ts: body.ts });
			}),
			// First-event hydration of `slackUserCache` fires `syncUsers` in
			// the background; stub a trivial directory so it doesn't log noise.
			http.get("https://slack.com/api/users.list", () =>
				HttpResponse.json({
					ok: true,
					members: [{ id: "U_HUMAN", name: "human" }],
					response_metadata: { next_cursor: "" },
				}),
			),
		);

		const body = JSON.stringify({
			type: "event_callback",
			event_id: "Ev_smoke_1",
			team_id: "T_A",
			event: {
				type: "app_mention",
				channel: "C_A",
				user: "U_HUMAN",
				text: "hi",
				ts: "1.1",
				thread_ts: "0.5",
			},
		});

		const res = await t.fetch("/slack/events", {
			method: "POST",
			headers: signedHeaders(body),
			body,
		});
		expect(res.status).toBe(200);

		await t.finishAllScheduledFunctions(vi.runAllTimers);

		// Painter `start()` posts the anchor eagerly ("thinking..."
		// placeholder), streaming text and the final flushFinal land via
		// chat.update.
		expect(posted).toHaveLength(1);
		expect(posted[0]).toMatchObject({ channel: "C_A", thread_ts: "0.5" });
		expect(posted[0]?.text).toBe("_thinking..._");
		expect(updated.length).toBeGreaterThanOrEqual(1);
		const lastUpdate = updated.at(-1);
		expect(lastUpdate).toMatchObject({ channel: "C_A", ts: "9.9", text: "echo: hi" });
	});

	it("slack dedupe: same event_id delivered twice produces a single reply", async () => {
		const t = newTest();
		await seedOrgWithAgent(t, "org_A");
		await seedSlackInstall(t, "org_A", "T_A", "UBOT");

		let hits = 0;
		server.use(
			http.post("https://slack.com/api/chat.postMessage", async () => {
				hits += 1;
				return HttpResponse.json({ ok: true, channel: "C_A", ts: `${hits}.0` });
			}),
			http.post("https://slack.com/api/chat.update", async ({ request }) => {
				const body = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({ ok: true, channel: "C_A", ts: body.ts });
			}),
			http.get("https://slack.com/api/users.list", () =>
				HttpResponse.json({
					ok: true,
					members: [{ id: "U_HUMAN", name: "human" }],
					response_metadata: { next_cursor: "" },
				}),
			),
		);

		const body = JSON.stringify({
			type: "event_callback",
			event_id: "Ev_smoke_dup",
			team_id: "T_A",
			event: {
				type: "app_mention",
				channel: "C_A",
				user: "U_HUMAN",
				text: "hi",
				ts: "1.2",
			},
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
		const secondJson = (await second.json()) as { deduped?: boolean };
		expect(secondJson.deduped).toBe(true);

		await t.finishAllScheduledFunctions(vi.runAllTimers);
		expect(hits).toBe(1);
	});
});
