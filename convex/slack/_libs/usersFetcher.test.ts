import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { UsersListResult } from "./slackClient";
import { fetchAllUsers, mapMember } from "./usersFetcher";

describe("usersFetcher", () => {
	it("walks next_cursor across pages and concatenates members", async () => {
		const pages: UsersListResult[] = [
			{
				ok: true,
				members: [
					{ id: "U1", name: "alice", profile: { display_name: "Alice" } },
					{ id: "U2", name: "bob", profile: { display_name: "Bob" } },
				],
				response_metadata: { next_cursor: "cur2" },
			},
			{
				ok: true,
				members: [{ id: "U3", name: "carol", profile: { real_name: "Carol Smith" } }],
				response_metadata: { next_cursor: "" },
			},
		];
		const seenCursors: (string | undefined)[] = [];
		const fetchPage = async ({ cursor }: { cursor?: string }) => {
			seenCursors.push(cursor);
			const next = pages.shift();
			if (!next) throw new Error("ran out of pages");
			return next;
		};

		const out = await fetchAllUsers({ fetchPage });

		expect(seenCursors).toEqual([undefined, "cur2"]);
		expect(out.map((u) => u.userId)).toEqual(["U1", "U2", "U3"]);
		expect(out[2]?.displayName).toBe("Carol Smith"); // falls back to real_name
	});

	it("filters out deleted users", async () => {
		const fetchPage = async () =>
			({
				ok: true,
				members: [
					{ id: "U1", name: "alice" },
					{ id: "U2", name: "bob", deleted: true },
				],
				response_metadata: { next_cursor: "" },
			}) satisfies UsersListResult;

		const out = await fetchAllUsers({ fetchPage });
		expect(out.map((u) => u.userId)).toEqual(["U1"]);
	});

	it("throws ConvexError when Slack returns ok=false", async () => {
		const fetchPage = async () =>
			({ ok: false, error: "missing_scope" }) satisfies UsersListResult;
		await expect(fetchAllUsers({ fetchPage })).rejects.toBeInstanceOf(ConvexError);
	});

	it("throws when pages exceed maxPages safety cap", async () => {
		const fetchPage = async () =>
			({
				ok: true,
				members: [{ id: "U1", name: "x" }],
				response_metadata: { next_cursor: "always_more" },
			}) satisfies UsersListResult;

		await expect(fetchAllUsers({ fetchPage, maxPages: 3 })).rejects.toBeInstanceOf(ConvexError);
	});

	it("mapMember picks display_name over real_name when both present", () => {
		const u = mapMember({
			id: "U1",
			name: "u_handle",
			profile: { display_name: "Cool Name", real_name: "Boring Name" },
			is_bot: true,
		});
		expect(u).toEqual({
			userId: "U1",
			username: "u_handle",
			displayName: "Cool Name",
			isBot: true,
		});
	});

	it("mapMember falls back to name when no profile fields set", () => {
		const u = mapMember({ id: "U2", name: "raw" });
		expect(u.displayName).toBe("raw");
		expect(u.isBot).toBe(false);
	});
});
