import { describe, expect, it } from "vitest";
import { http, HttpResponse, server } from "../_helpers/msw";

describe("M0-T03 MSW setup", () => {
	it("intercepts fetch and returns mocked response", async () => {
		server.use(http.get("https://example.test/api", () => HttpResponse.json({ hello: "world" })));
		const res = await fetch("https://example.test/api");
		const body = await res.json();
		expect(body).toEqual({ hello: "world" });
	});

	it("resetHandlers between tests — no stale interceptor", async () => {
		const res = await fetch("https://example.test/api").catch(() => null);
		// Without a handler, fetch either fails (onUnhandledRequest=error) or passes through.
		// Our global setup uses 'bypass', so we expect either a network error or a real response.
		// Just assert no accidental mock lingers from the previous test:
		if (res) {
			const body = await res.json().catch(() => ({}));
			expect(body).not.toEqual({ hello: "world" });
		}
	});
});
