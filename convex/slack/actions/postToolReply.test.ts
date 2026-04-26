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

describe("F-03 slack postToolReply action", () => {
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

	it("posts as a thread reply under parentTs and returns the reply ts", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		const received: Array<Record<string, unknown>> = [];
		server.use(
			http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
				received.push((await request.json()) as Record<string, unknown>);
				return HttpResponse.json({ ok: true, channel: "C1", ts: "999.111" });
			}),
		);

		const ts = await t.action(internal.slack.actions.postToolReply.default, {
			installId,
			channelId: "C1",
			parentTs: "200.0001",
			text: "called http.fetch",
		});
		expect(ts).toBe("999.111");
		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({
			channel: "C1",
			thread_ts: "200.0001",
			text: "called http.fetch",
		});
	});

	it("retries 429 with Retry-After then succeeds", async () => {
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
				return HttpResponse.json({ ok: true, channel: "C1", ts: "999.222" });
			}),
		);

		const ts = await t.action(internal.slack.actions.postToolReply.default, {
			installId,
			channelId: "C1",
			parentTs: "200.0001",
			text: "x",
		});
		expect(ts).toBe("999.222");
		expect(hits).toBe(2);
	});
});
