import { describe, expect, it } from "vitest";
import { http, HttpResponse, server } from "../../../test/_helpers/msw";
import { chatUpdate } from "./slackClient";

describe("F-03 slackClient.chatUpdate", () => {
	it("posts to chat.update with channel/ts/text and returns ok", async () => {
		const received: Array<Record<string, unknown>> = [];
		server.use(
			http.post("https://slack.com/api/chat.update", async ({ request }) => {
				received.push((await request.json()) as Record<string, unknown>);
				return HttpResponse.json({ ok: true, channel: "C1", ts: "111.0" });
			}),
		);
		const resp = await chatUpdate({
			botToken: "xoxb-test",
			channel: "C1",
			ts: "111.0",
			text: "edited",
		});
		expect(resp.status).toBe(200);
		expect(resp.result.ok).toBe(true);
		expect(received[0]).toMatchObject({ channel: "C1", ts: "111.0", text: "edited" });
	});

	it("surfaces 4xx slack errors via the result envelope", async () => {
		server.use(
			http.post("https://slack.com/api/chat.update", () =>
				HttpResponse.json({ ok: false, error: "message_not_found" }, { status: 200 }),
			),
		);
		const resp = await chatUpdate({
			botToken: "xoxb-test",
			channel: "C1",
			ts: "missing",
			text: "x",
		});
		expect(resp.result.ok).toBe(false);
		if (!resp.result.ok) expect(resp.result.error).toBe("message_not_found");
	});

	it("surfaces 429 + Retry-After header for the caller's retry loop", async () => {
		server.use(
			http.post("https://slack.com/api/chat.update", () =>
				HttpResponse.json(
					{ ok: false, error: "rate_limited" },
					{ status: 429, headers: { "retry-after": "2" } },
				),
			),
		);
		const resp = await chatUpdate({
			botToken: "xoxb-test",
			channel: "C1",
			ts: "1.0",
			text: "x",
		});
		expect(resp.status).toBe(429);
		expect(resp.retryAfterSec).toBe(2);
	});
});
