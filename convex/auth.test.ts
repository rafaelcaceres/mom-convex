import { describe, expect, it } from "vitest";
import { newTest } from "../test/_helpers/convex";
import { requireIdentity, userSubjectFromIdentity } from "./auth.utils";

describe("M0-T02 auth wiring", () => {
	it("auth tables are present in the schema", async () => {
		const t = newTest();
		// Inserting a dummy row into `users` is a smoke check that `authTables`
		// composition worked (table would not exist otherwise).
		const id = await t.run(async (ctx) => {
			return ctx.db.insert("users", {});
		});
		expect(id).toBeDefined();
	});

	it("requireIdentity rejects unauthenticated ctx", async () => {
		const t = newTest();
		await expect(
			t.run(async (ctx) => {
				await requireIdentity(ctx);
			}),
		).rejects.toThrow(/authentication required/i);
	});

	it("requireIdentity accepts ctx with withIdentity", async () => {
		const t = newTest();
		const subject = await t.withIdentity({ subject: "test-user" }).run(async (ctx) => {
			const identity = await requireIdentity(ctx);
			return userSubjectFromIdentity(identity);
		});
		expect(subject).toBe("test-user");
	});
});
