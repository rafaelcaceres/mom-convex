import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { seedSkillCatalog } from "../_seeds";

/**
 * `memory.save` — the agent writing its own memory.
 *
 * The assertions that matter are about *where* the memory lands, not that a row
 * appeared: the model names the fact, the server names the room. A Slack turn
 * files under the channel (so a later thread in that channel recalls it) and,
 * critically, a different channel never sees it.
 */

async function setup(t: ReturnType<typeof newTest>) {
	await t.run(async (ctx) => {
		await seedSkillCatalog(ctx);
	});
	const userId = await t.run((ctx) => ctx.db.insert("users", {}));
	const owner = t.withIdentity({ subject: userId });
	const { orgId } = await owner.mutation(api.tenancy.mutations.completeOnboarding.default, {
		orgName: "Acme",
	});
	const agents = await owner.query(api.agents.queries.listByOrg.default, { orgId });
	const agentId = agents[0]?._id as Id<"agents">;
	return { owner, userId, orgId, agentId };
}

/** A Slack thread in `channelId`, distinct threads sharing one channel. */
async function slackThread(
	t: ReturnType<typeof newTest>,
	clause: { orgId: string; agentId: Id<"agents">; channelId: string; threadTs: string },
) {
	return t.run((ctx) =>
		ctx.db.insert("threads", {
			orgId: clause.orgId,
			agentId: clause.agentId,
			agentThreadId: `pending:${clause.threadTs}`,
			bindingKey: `slack:inst_1:${clause.channelId}:${clause.threadTs}`,
			binding: {
				type: "slack",
				installId: "inst_1",
				channelId: clause.channelId,
				threadTs: clause.threadTs,
			},
		}),
	);
}

function invokeSave(
	t: ReturnType<typeof newTest>,
	scope: { orgId: string; agentId: Id<"agents">; threadId: Id<"threads"> },
	args: Record<string, unknown>,
) {
	return t.action(internal.skills.actions.invoke.default, {
		skillKey: "memory.save",
		args,
		// `agentThreadId` / `userId` are part of the dispatcher's turn context but
		// irrelevant to this skill — it resolves everything it needs from the
		// thread row.
		scope: { ...scope, agentThreadId: "at_1", userId: null },
		toolCallId: "tc_save",
	});
}

describe("memory.save skill", () => {
	it("a Slack turn files the memory under the channel, shared across threads", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const threadA = await slackThread(t, { orgId, agentId, channelId: "C_ENG", threadTs: "1.1" });

		await invokeSave(
			t,
			{ orgId, agentId, threadId: threadA },
			{ content: "Deploys go out on Fridays" },
		);

		const rows = await t.run((ctx) => ctx.db.query("memory").collect());
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			scope: "channel",
			channelKey: "slack:inst_1:C_ENG",
			content: "Deploys go out on Fridays",
			alwaysOn: true,
			updatedByAgentId: agentId,
		});
		// The agent authored it — no human should be credited.
		expect(rows[0]?.updatedBy).toBeUndefined();

		// A *different thread* in the same channel sees it on its next turn.
		const threadB = await slackThread(t, { orgId, agentId, channelId: "C_ENG", threadTs: "2.2" });
		const visibleInB = await t.query(internal.memory.queries.listAlwaysOnInternal.default, {
			orgId,
			agentId,
			threadId: threadB,
		});
		expect(visibleInB.map((m) => m.content)).toEqual(["Deploys go out on Fridays"]);
	});

	it("does not leak across channels — #sales cannot see what was learned in #eng", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const eng = await slackThread(t, { orgId, agentId, channelId: "C_ENG", threadTs: "1.1" });
		const sales = await slackThread(t, { orgId, agentId, channelId: "C_SALES", threadTs: "1.1" });

		await invokeSave(t, { orgId, agentId, threadId: eng }, { content: "staging db is flaky" });

		const inEng = await t.query(internal.memory.queries.listAlwaysOnInternal.default, {
			orgId,
			agentId,
			threadId: eng,
		});
		const inSales = await t.query(internal.memory.queries.listAlwaysOnInternal.default, {
			orgId,
			agentId,
			threadId: sales,
		});

		expect(inEng.map((m) => m.content)).toEqual(["staging db is flaky"]);
		expect(inSales).toEqual([]);
	});

	it("a web turn has no channel, so it falls back to thread scope", async () => {
		const t = newTest();
		const { owner, orgId, agentId } = await setup(t);
		const threadId = await owner.mutation(api.webChat.mutations.createThread.default, { orgId });

		await invokeSave(t, { orgId, agentId, threadId }, { content: "prefers metric units" });

		const rows = await t.run((ctx) => ctx.db.query("memory").collect());
		expect(rows[0]).toMatchObject({
			scope: "thread",
			threadId,
			agentId,
			content: "prefers metric units",
		});
		expect(rows[0]?.channelKey).toBeUndefined();
	});

	it("asking for channel scope on a channel-less platform degrades to thread, not a fake room", async () => {
		const t = newTest();
		const { owner, orgId, agentId } = await setup(t);
		const threadId = await owner.mutation(api.webChat.mutations.createThread.default, { orgId });

		await invokeSave(t, { orgId, agentId, threadId }, { content: "x", scope: "channel" });

		const rows = await t.run((ctx) => ctx.db.query("memory").collect());
		expect(rows[0]?.scope).toBe("thread");
		expect(rows[0]?.channelKey).toBeUndefined();
	});

	it("the model can force thread scope inside a channel (a fact that isn't the room's business)", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const threadId = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		await invokeSave(t, { orgId, agentId, threadId }, { content: "one-off", scope: "thread" });

		const rows = await t.run((ctx) => ctx.db.query("memory").collect());
		expect(rows[0]?.scope).toBe("thread");
		expect(rows[0]?.channelKey).toBeUndefined();
	});

	it("runs without human confirmation, unlike other write skills", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const threadId = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		// No DEV_AUTO_APPROVE_WRITES here: the catalog entry opts out explicitly.
		const result = await invokeSave(t, { orgId, agentId, threadId }, { content: "remember me" });

		expect(result).not.toMatchObject({ requireConfirmation: true });
		expect(await t.run((ctx) => ctx.db.query("memory").collect())).toHaveLength(1);
	});

	it("rejects empty content instead of saving a blank memory", async () => {
		const t = newTest();
		const { orgId, agentId } = await setup(t);
		const threadId = await slackThread(t, {
			orgId,
			agentId,
			channelId: "C_ENG",
			threadTs: "1.1",
		});

		// The dispatcher never throws — impl errors come back as tool results the
		// model can read and recover from.
		const result = (await invokeSave(t, { orgId, agentId, threadId }, { content: "" })) as {
			isError?: boolean;
		};
		expect(result.isError).toBe(true);
		expect(await t.run((ctx) => ctx.db.query("memory").collect())).toHaveLength(0);
	});
});
