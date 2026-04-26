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

describe("F-03 slack postOrUpdateMain action", () => {
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

	it("posts fresh when ts is absent and returns the new message ts", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		const postedTo: string[] = [];
		const updatedTo: string[] = [];
		server.use(
			http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
				const body = (await request.json()) as { text: string };
				postedTo.push(body.text);
				return HttpResponse.json({ ok: true, channel: "C1", ts: "200.0001" });
			}),
			http.post("https://slack.com/api/chat.update", async ({ request }) => {
				const body = (await request.json()) as { text: string };
				updatedTo.push(body.text);
				return HttpResponse.json({ ok: true, channel: "C1", ts: "200.0001" });
			}),
		);

		const ts = await t.action(internal.slack.actions.postOrUpdateMain.default, {
			installId,
			channelId: "C1",
			threadTs: "100.0",
			text: "hello **world**",
		});
		expect(ts).toBe("200.0001");
		expect(postedTo).toEqual(["hello *world*"]);
		expect(updatedTo).toHaveLength(0);
	});

	it("calls chat.update when ts is present and returns the same ts", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		const postedTo: string[] = [];
		const updatedPayloads: Array<Record<string, unknown>> = [];
		server.use(
			http.post("https://slack.com/api/chat.postMessage", async ({ request }) => {
				const body = (await request.json()) as { text: string };
				postedTo.push(body.text);
				return HttpResponse.json({ ok: true, channel: "C1", ts: "ZZZ" });
			}),
			http.post("https://slack.com/api/chat.update", async ({ request }) => {
				updatedPayloads.push((await request.json()) as Record<string, unknown>);
				return HttpResponse.json({ ok: true, channel: "C1", ts: "200.0001" });
			}),
		);

		const ts = await t.action(internal.slack.actions.postOrUpdateMain.default, {
			installId,
			channelId: "C1",
			threadTs: "100.0",
			ts: "200.0001",
			text: "final answer",
		});
		expect(ts).toBe("200.0001");
		expect(updatedPayloads).toHaveLength(1);
		expect(updatedPayloads[0]).toMatchObject({
			channel: "C1",
			ts: "200.0001",
			text: "final answer",
		});
		expect(postedTo).toHaveLength(0);
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
				return HttpResponse.json({ ok: true, channel: "C1", ts: "300.0" });
			}),
		);

		const ts = await t.action(internal.slack.actions.postOrUpdateMain.default, {
			installId,
			channelId: "C1",
			text: "hi",
		});
		expect(ts).toBe("300.0");
		expect(hits).toBe(2);
	});
});
