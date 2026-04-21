import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { internal } from "../../_generated/api";

describe("M1-T04 recordOrSkipEvent internal mutation", () => {
	it("recorded first, duplicate after", async () => {
		const t = newTest();
		const first = await t.mutation(internal.slack.mutations.recordOrSkipEvent.default, {
			eventId: "Ev777",
		});
		expect(first).toBe("recorded");

		const second = await t.mutation(internal.slack.mutations.recordOrSkipEvent.default, {
			eventId: "Ev777",
		});
		expect(second).toBe("duplicate");
	});

	it("different ids don't collide", async () => {
		const t = newTest();
		await t.mutation(internal.slack.mutations.recordOrSkipEvent.default, {
			eventId: "a",
		});
		const b = await t.mutation(internal.slack.mutations.recordOrSkipEvent.default, {
			eventId: "b",
		});
		expect(b).toBe("recorded");
	});
});
