import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { http, HttpResponse, server } from "../../../test/_helpers/msw";
import { internal } from "../../_generated/api";
import { encrypt, generateMasterKeyBase64 } from "../../_shared/_libs/crypto";

const ORIGINAL_KEY = process.env.CREDS_MASTER_KEY;

async function seedInstall(t: ReturnType<typeof newTest>) {
	const botTokenEnc = await encrypt("xoxb-real");
	return t.run(async (ctx) =>
		ctx.db.insert("slackInstalls", {
			orgId: "org_A",
			teamId: "T1",
			teamName: "Team",
			botTokenEnc,
			scope: "chat:write",
			botUserId: "UBOT",
		}),
	);
}

describe("M1-T10 slack postMessage action", () => {
	beforeEach(() => {
		process.env.CREDS_MASTER_KEY = generateMasterKeyBase64();
	});
	afterEach(() => {
		if (ORIGINAL_KEY === undefined) {
			// biome-ignore lint/performance/noDelete: env isolation between tests
			delete process.env.CREDS_MASTER_KEY;
		} else {
			process.env.CREDS_MASTER_KEY = ORIGINAL_KEY;
		}
	});

	it("posts a single chunk and forwards converted mrkdwn + thread_ts", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		const received: Array<Record<string, unknown>> = [];
		server.use(
			http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
				const body = (await request.json()) as Record<string, unknown>;
				received.push(body);
				return HttpResponse.json({ ok: true, channel: "C1", ts: "111.000001" });
			}),
		);

		await t.action(internal.slack.actions.postMessage.default, {
			installId,
			channelId: "C1",
			threadTs: "100.0",
			text: "hello **world** [x](http://x)",
		});

		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({
			channel: "C1",
			thread_ts: "100.0",
			text: "hello *world* <http://x|x>",
		});
	});

	it("throws a ConvexError when Slack returns channel_not_found", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		server.use(
			http.post("https://slack.com/api/chat.postMessage", () =>
				HttpResponse.json({ ok: false, error: "channel_not_found" }, { status: 200 }),
			),
		);

		await expect(
			t.action(internal.slack.actions.postMessage.default, {
				installId,
				channelId: "C_MISSING",
				text: "hi",
			}),
		).rejects.toThrow(/channel_not_found/);
	});

	it("retries on 429 with Retry-After then succeeds", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		let hits = 0;
		server.use(
			http.post("https://slack.com/api/chat.postMessage", () => {
				hits += 1;
				if (hits === 1) {
					return HttpResponse.json(
						{ ok: false, error: "rate_limited" },
						{ status: 429, headers: { "retry-after": "0" } },
					);
				}
				return HttpResponse.json({ ok: true, channel: "C1", ts: "111.000002" });
			}),
		);

		await t.action(internal.slack.actions.postMessage.default, {
			installId,
			channelId: "C1",
			text: "hi",
		});
		expect(hits).toBe(2);
	});

	it("sends each chunk when splitForSlack produces multiple", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		const received: string[] = [];
		server.use(
			http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
				const body = (await request.json()) as { text: string };
				received.push(body.text);
				return HttpResponse.json({ ok: true, channel: "C1", ts: `${received.length}.0` });
			}),
		);

		const big = `${"para ".repeat(1000)}\n\n${"para ".repeat(1000)}`;
		await t.action(internal.slack.actions.postMessage.default, {
			installId,
			channelId: "C1",
			text: big,
		});
		expect(received.length).toBeGreaterThan(1);
		// Continuation marker signals ordering preserved.
		expect(received[1]?.startsWith("_(continued)_")).toBe(true);
	});
});
