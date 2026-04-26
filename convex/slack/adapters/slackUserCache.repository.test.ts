import { describe, expect, it } from "vitest";
import { newTest } from "../../../test/_helpers/convex";
import { SlackUserCacheRepository } from "./slackUserCache.repository";

function makeUser(overrides: Partial<{
	orgId: string;
	teamId: string;
	userId: string;
	username: string;
	displayName: string;
	isBot: boolean;
	fetchedAt: number;
}> = {}) {
	return {
		orgId: "org_1",
		teamId: "T1",
		userId: "U1",
		username: "alice",
		displayName: "Alice",
		isBot: false,
		fetchedAt: 1_700_000_000_000,
		...overrides,
	};
}

describe("SlackUserCacheRepository", () => {
	it("upsertByTeamUser: inserts on first call", async () => {
		const t = newTest();
		const user = makeUser();
		const got = await t.run(async (ctx) => {
			const agg = await SlackUserCacheRepository.upsertByTeamUser(ctx, user);
			return agg.getModel();
		});
		expect(got.userId).toBe("U1");
		expect(got.displayName).toBe("Alice");
	});

	it("upsertByTeamUser: replaces existing row for same (teamId, userId)", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await SlackUserCacheRepository.upsertByTeamUser(ctx, makeUser());
		});
		await t.run(async (ctx) => {
			await SlackUserCacheRepository.upsertByTeamUser(
				ctx,
				makeUser({ displayName: "Alice (renamed)", fetchedAt: 1_700_000_001_000 }),
			);
		});

		const all = await t.run(async (ctx) => {
			const aggs = await SlackUserCacheRepository.listByTeam(ctx, { teamId: "T1" });
			return aggs.map((a) => a.getModel());
		});
		expect(all).toHaveLength(1);
		expect(all[0]?.displayName).toBe("Alice (renamed)");
		expect(all[0]?.fetchedAt).toBe(1_700_000_001_000);
	});

	it("getByTeamUser scopes by team — same userId in different teams stays separate", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await SlackUserCacheRepository.upsertByTeamUser(ctx, makeUser());
			await SlackUserCacheRepository.upsertByTeamUser(
				ctx,
				makeUser({ teamId: "T2", displayName: "Other Alice" }),
			);
		});

		const t1 = await t.run(async (ctx) => {
			const agg = await SlackUserCacheRepository.getByTeamUser(ctx, {
				teamId: "T1",
				userId: "U1",
			});
			return agg?.getModel() ?? null;
		});
		const t2 = await t.run(async (ctx) => {
			const agg = await SlackUserCacheRepository.getByTeamUser(ctx, {
				teamId: "T2",
				userId: "U1",
			});
			return agg?.getModel() ?? null;
		});
		expect(t1?.displayName).toBe("Alice");
		expect(t2?.displayName).toBe("Other Alice");
	});

	it("listByTeam returns every cached user for that team", async () => {
		const t = newTest();
		await t.run(async (ctx) => {
			await SlackUserCacheRepository.upsertByTeamUser(ctx, makeUser({ userId: "U1" }));
			await SlackUserCacheRepository.upsertByTeamUser(ctx, makeUser({ userId: "U2" }));
			await SlackUserCacheRepository.upsertByTeamUser(
				ctx,
				makeUser({ teamId: "T2", userId: "U99" }),
			);
		});

		const t1Users = await t.run(async (ctx) => {
			const aggs = await SlackUserCacheRepository.listByTeam(ctx, { teamId: "T1" });
			return aggs.map((a) => a.getModel().userId);
		});
		expect(t1Users.sort()).toEqual(["U1", "U2"]);
	});

	it("getByTeamUser returns null for cache miss", async () => {
		const t = newTest();
		const hit = await t.run(async (ctx) => {
			const agg = await SlackUserCacheRepository.getByTeamUser(ctx, {
				teamId: "T1",
				userId: "U_missing",
			});
			return agg?.getModel() ?? null;
		});
		expect(hit).toBeNull();
	});
});
