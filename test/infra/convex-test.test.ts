import { describe, expect, it } from "vitest";
import { newTest } from "../_helpers/convex";

describe("M0-T03 convex-test helper", () => {
	it("instantiates with project schema", () => {
		const t = newTest();
		expect(t).toBeDefined();
		expect(typeof t.query).toBe("function");
		expect(typeof t.mutation).toBe("function");
		expect(typeof t.run).toBe("function");
	});

	it("provides DB access via t.run", async () => {
		const t = newTest();
		const count = await t.run(async (ctx) => {
			// Empty schema — no tables. Just confirm ctx.db is reachable.
			return typeof ctx.db;
		});
		expect(count).toBe("object");
	});
});
