import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api } from "../../_generated/api";

const baseAgent = {
	orgId: "org_A",
	slug: "default",
	name: "Default",
	systemPrompt: "You are mom.",
	modelId: "claude-sonnet-4-5",
	modelProvider: "anthropic",
};

describe("M1-T11 webChat.myThreads", () => {
	it("requires auth", async () => {
		const t = newTest();
		await expect(
			t.query(api.webChat.queries.myThreads.default, { orgId: "org_A" }),
		).rejects.toThrow(/Authentication required/);
	});

	it("returns only the caller's web threads in the requested org", async () => {
		const t = newTest();
		const userA = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const userB = await t.run(async (ctx) => ctx.db.insert("users", {}));
		const callerA = t.withIdentity({ subject: userA });
		const callerB = t.withIdentity({ subject: userB });

		await callerA.mutation(api.agents.mutations.createAgent.default, baseAgent);
		await callerA.mutation(api.webChat.mutations.createThread.default, { orgId: "org_A" });
		await callerB.mutation(api.webChat.mutations.createThread.default, { orgId: "org_A" });

		const mine = await callerA.query(api.webChat.queries.myThreads.default, { orgId: "org_A" });
		expect(mine).toHaveLength(1);
		expect(mine[0]?.binding).toMatchObject({ type: "web", userId: userA });
	});
});
