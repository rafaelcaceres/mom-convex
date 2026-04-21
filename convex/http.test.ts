import { describe, expect, it } from "vitest";
import { newTest } from "../test/_helpers/convex";

describe("M0-T07 http router", () => {
	it("GET /health returns 200 { ok: true, commit }", async () => {
		const t = newTest();
		const res = await t.fetch("/health", { method: "GET" });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; commit: string };
		expect(body.ok).toBe(true);
		expect(typeof body.commit).toBe("string");
		expect(body.commit.length).toBeGreaterThan(0);
	});

	it("GET /health exposes JSON content type", async () => {
		const t = newTest();
		const res = await t.fetch("/health", { method: "GET" });
		expect(res.headers.get("content-type")).toMatch(/application\/json/);
	});

	it("GET /unknown returns 404", async () => {
		const t = newTest();
		const res = await t.fetch("/unknown-route-does-not-exist", { method: "GET" });
		expect(res.status).toBe(404);
	});
});
