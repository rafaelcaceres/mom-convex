import { describe, expect, it } from "vitest";
import { http, HttpResponse, server } from "../../../test/_helpers/msw";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { ToolInvokeScope } from "../_libs/resolveTools";
import { httpFetchImpl } from "./httpFetch";

const fakeCtx = {} as ActionCtx;
const fakeScope: ToolInvokeScope = {
	orgId: "org_A",
	agentId: "agents_placeholder" as unknown as Id<"agents">,
	threadId: "threads_placeholder" as unknown as Id<"threads">,
	agentThreadId: "agentThread_1",
	userId: null,
};

function opts(): { signal: AbortSignal; scope: ToolInvokeScope } {
	return { signal: new AbortController().signal, scope: fakeScope };
}

describe("M2-T06 http.fetch impl", () => {
	it("GET returns status, headers, and body text", async () => {
		server.use(
			http.get("https://example.test/hello", () =>
				HttpResponse.text("hi there", {
					status: 200,
					headers: { "x-mom-marker": "ok" },
				}),
			),
		);

		const result = (await httpFetchImpl(
			fakeCtx,
			{ url: "https://example.test/hello" },
			opts(),
		)) as { status: number; headers: Record<string, string>; body: string };

		expect(result.status).toBe(200);
		expect(result.body).toBe("hi there");
		expect(result.headers["x-mom-marker"]).toBe("ok");
	});

	it("POST forwards JSON body and returns the response body", async () => {
		let receivedBody: string | null = null;
		let receivedMethod: string | null = null;
		server.use(
			http.post("https://example.test/api", async ({ request }) => {
				receivedMethod = request.method;
				receivedBody = await request.text();
				return HttpResponse.json({ echoed: true });
			}),
		);

		const result = (await httpFetchImpl(
			fakeCtx,
			{
				url: "https://example.test/api",
				method: "POST",
				headers: { "content-type": "application/json" },
				body: '{"n":1}',
			},
			opts(),
		)) as { status: number; body: string };

		expect(receivedMethod).toBe("POST");
		expect(receivedBody).toBe('{"n":1}');
		expect(result.status).toBe(200);
		expect(JSON.parse(result.body)).toEqual({ echoed: true });
	});

	it("times out (AbortSignal.timeout) with a structured error — no hang", async () => {
		server.use(http.get("https://example.test/slow", () => new Promise<Response>(() => undefined)));

		// Shrink the 10s production timeout to something fast for the test so we
		// don't actually wait 10 seconds in CI. Replace the static instead of
		// using vi.spyOn because Vitest's spy doesn't always intercept
		// non-configurable statics like AbortSignal.timeout in Node 20+.
		const original = AbortSignal.timeout.bind(AbortSignal);
		(AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (_ms: number) =>
			original(50);
		const start = Date.now();
		try {
			await expect(
				httpFetchImpl(fakeCtx, { url: "https://example.test/slow" }, opts()),
			).rejects.toThrow(/timed out|timeout/i);
		} finally {
			(AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = original;
		}
		expect(Date.now() - start).toBeLessThan(2_000);
	});

	it("5xx responses surface the status via thrown error (isError=true downstream)", async () => {
		server.use(
			http.get("https://example.test/boom", () => HttpResponse.text("boom", { status: 503 })),
		);

		await expect(
			httpFetchImpl(fakeCtx, { url: "https://example.test/boom" }, opts()),
		).rejects.toThrow(/503/);
	});

	it("truncates large response bodies to keep the model context bounded", async () => {
		const big = "x".repeat(120_000);
		server.use(http.get("https://example.test/big", () => HttpResponse.text(big)));

		const result = (await httpFetchImpl(fakeCtx, { url: "https://example.test/big" }, opts())) as {
			status: number;
			body: string;
			truncated?: boolean;
			originalBodyBytes?: number;
		};

		expect(result.truncated).toBe(true);
		expect(result.originalBodyBytes).toBe(120_000);
		// Truncation marker included; total well under the 120k original.
		expect(result.body.length).toBeLessThan(51_000);
		expect(result.body).toMatch(/truncated.*more chars/i);
	});

	it("4xx responses are returned as successful results with the status code", async () => {
		server.use(
			http.get("https://example.test/missing", () => HttpResponse.text("nope", { status: 404 })),
		);

		const result = (await httpFetchImpl(
			fakeCtx,
			{ url: "https://example.test/missing" },
			opts(),
		)) as { status: number; body: string };

		expect(result.status).toBe(404);
		expect(result.body).toBe("nope");
	});

	describe("SSRF guard", () => {
		const blocked = [
			"http://10.0.0.1/",
			"http://10.255.255.255/",
			"http://127.0.0.1/",
			"http://127.1.2.3/",
			"http://192.168.1.1/",
			"http://169.254.169.254/",
			"http://172.16.0.1/",
			"http://172.31.255.255/",
			"http://localhost/",
			"http://0.0.0.0/",
		];

		for (const url of blocked) {
			it(`blocks ${url}`, async () => {
				await expect(httpFetchImpl(fakeCtx, { url }, opts())).rejects.toThrow(/SSRF|blocked/i);
			});
		}

		it("blocks non-http(s) protocols", async () => {
			await expect(httpFetchImpl(fakeCtx, { url: "file:///etc/passwd" }, opts())).rejects.toThrow(
				/protocol/i,
			);
		});

		it("allows public hostnames through to fetch", async () => {
			server.use(http.get("https://api.example.com/x", () => HttpResponse.text("ok")));
			const result = (await httpFetchImpl(
				fakeCtx,
				{ url: "https://api.example.com/x" },
				opts(),
			)) as { status: number };
			expect(result.status).toBe(200);
		});
	});
});
