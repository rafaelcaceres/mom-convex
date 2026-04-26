import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { http, HttpResponse, server } from "../../../test/_helpers/msw";
import { internal } from "../../_generated/api";
import { encrypt, generateMasterKeyBase64 } from "../../_shared/_libs/crypto";
import { SlackUserCacheRepository } from "../adapters/slackUserCache.repository";

const ORIGINAL_KEY = process.env.CREDS_MASTER_KEY;

async function seedInstall(t: ReturnType<typeof newTest>) {
	const botTokenEnc = await encrypt("xoxb-real");
	return t.run(async (ctx) =>
		ctx.db.insert("slackInstalls", {
			orgId: "org_A",
			teamId: "T1",
			teamName: "Team",
			botTokenEnc,
			scope: "users:read,chat:write",
			botUserId: "UBOT",
		}),
	);
}

describe("slack syncUsers action", () => {
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

	it("walks paginated users.list and writes upserts scoped to the install's team", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		const responses = [
			{
				ok: true,
				members: [
					{ id: "U1", name: "alice", profile: { display_name: "Alice" } },
					{ id: "U2", name: "bob", profile: { real_name: "Bob Roberts" } },
					{ id: "UBOT", name: "appbot", is_bot: true },
				],
				response_metadata: { next_cursor: "cur2" },
			},
			{
				ok: true,
				members: [{ id: "U3", name: "carol", deleted: true }],
				response_metadata: { next_cursor: "" },
			},
		];
		const seenCursors: (string | null)[] = [];
		server.use(
			http.get("https://slack.com/api/users.list", ({ request }) => {
				const url = new URL(request.url);
				seenCursors.push(url.searchParams.get("cursor"));
				const next = responses.shift();
				if (!next) return HttpResponse.json({ ok: false, error: "exhausted" });
				return HttpResponse.json(next);
			}),
		);

		const out = await t.action(internal.slack.actions.syncUsers.default, { installId });
		expect(out).toEqual({ count: 3 }); // U3 deleted is filtered

		const cached = await t.run(async (ctx) => {
			const aggs = await SlackUserCacheRepository.listByTeam(ctx, { teamId: "T1" });
			return aggs.map((a) => a.getModel());
		});
		expect(cached.map((u) => u.userId).sort()).toEqual(["U1", "U2", "UBOT"]);
		expect(cached.find((u) => u.userId === "U1")?.displayName).toBe("Alice");
		expect(cached.find((u) => u.userId === "U2")?.displayName).toBe("Bob Roberts");
		expect(cached.find((u) => u.userId === "UBOT")?.isBot).toBe(true);
		// Cursor pagination wired through.
		expect(seenCursors).toEqual([null, "cur2"]);
	});

	it("re-running sync replaces stale rows for renamed users", async () => {
		const t = newTest();
		const installId = await seedInstall(t);

		server.use(
			http.get("https://slack.com/api/users.list", () =>
				HttpResponse.json({
					ok: true,
					members: [{ id: "U1", name: "alice", profile: { display_name: "Alice" } }],
					response_metadata: { next_cursor: "" },
				}),
			),
		);
		await t.action(internal.slack.actions.syncUsers.default, { installId });

		server.use(
			http.get("https://slack.com/api/users.list", () =>
				HttpResponse.json({
					ok: true,
					members: [{ id: "U1", name: "alice", profile: { display_name: "Alice (new)" } }],
					response_metadata: { next_cursor: "" },
				}),
			),
		);
		await t.action(internal.slack.actions.syncUsers.default, { installId });

		const cached = await t.run(async (ctx) => {
			const aggs = await SlackUserCacheRepository.listByTeam(ctx, { teamId: "T1" });
			return aggs.map((a) => a.getModel());
		});
		expect(cached).toHaveLength(1);
		expect(cached[0]?.displayName).toBe("Alice (new)");
	});

	it("throws when install is missing", async () => {
		const t = newTest();
		// Insert a row then delete to get a valid-shape id pointing nowhere.
		const phantomId = await t.run(async (ctx) => {
			const id = await ctx.db.insert("slackInstalls", {
				orgId: "x",
				teamId: "phantom",
				teamName: "x",
				botTokenEnc: { ciphertextB64: "x", nonceB64: "x", kid: "x" },
				scope: "",
				botUserId: "x",
			});
			await ctx.db.delete(id);
			return id;
		});
		await expect(
			t.action(internal.slack.actions.syncUsers.default, { installId: phantomId }),
		).rejects.toThrow(/install_not_found/);
	});

	it("propagates Slack errors as ConvexError", async () => {
		const t = newTest();
		const installId = await seedInstall(t);
		server.use(
			http.get("https://slack.com/api/users.list", () =>
				HttpResponse.json({ ok: false, error: "missing_scope" }),
			),
		);
		await expect(
			t.action(internal.slack.actions.syncUsers.default, { installId }),
		).rejects.toThrow(/users_list_failed/);
	});
});
