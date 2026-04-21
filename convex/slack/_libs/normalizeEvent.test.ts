import { describe, expect, it } from "vitest";
import { type SlackUserCache, normalizeSlackEvent } from "./normalizeEvent";

const BOT_USER_ID = "UBOT";

const cache: SlackUserCache = new Map([
	[BOT_USER_ID, { username: "botname", displayName: "Mom Bot" }],
	["U1", { username: "alice", displayName: "Alice" }],
	["U2", { username: "bob" }],
]);

describe("M1-T08 normalizeSlackEvent", () => {
	it("app_mention: replaces <@Ubot> with @botname and marks isMention", () => {
		const msg = normalizeSlackEvent(
			{
				type: "app_mention",
				channel: "C1",
				user: "U1",
				text: "<@UBOT> hello",
				ts: "1700000000.000100",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(msg).not.toBeNull();
		expect(msg?.text).toBe("@botname hello");
		expect(msg?.rawText).toBe("<@UBOT> hello");
		expect(msg?.isMention).toBe(true);
		expect(msg?.sender).toEqual({
			id: "U1",
			username: "alice",
			displayName: "Alice",
			isBot: false,
		});
		expect(msg?.channelId).toBe("C1");
		expect(msg?.id).toBe("1700000000.000100");
		// Slack ts fractional = microseconds → 100µs truncates to 0ms.
		expect(msg?.timestamp).toBe(new Date(1700000000 * 1000).toISOString());
	});

	it("message in DM counts as mention even without <@Ubot>", () => {
		const msg = normalizeSlackEvent(
			{
				type: "message",
				channel: "D1",
				channel_type: "im",
				user: "U2",
				text: "hey",
				ts: "1700000100.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(msg?.isMention).toBe(true);
		expect(msg?.text).toBe("hey");
		expect(msg?.sender.username).toBe("bob");
	});

	it("message in channel (non-DM) → null (app_mention covers this; dedup guard)", () => {
		const plain = normalizeSlackEvent(
			{
				type: "message",
				channel: "C1",
				channel_type: "channel",
				user: "U1",
				text: "just chatting",
				ts: "1700000200.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(plain).toBeNull();

		// Private channel ("group") — Slack still double-delivers with app_mention.
		const group = normalizeSlackEvent(
			{
				type: "message",
				channel: "G1",
				channel_type: "group",
				user: "U1",
				text: "hello <@UBOT>",
				ts: "1700000210.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(group).toBeNull();
	});

	it("unknown event types are ignored", () => {
		const msg = normalizeSlackEvent(
			{
				type: "reaction_added",
				channel: "C1",
				user: "U1",
				text: "",
				ts: "1700000250.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(msg).toBeNull();
	});

	it("unknown users resolve to <unknown:Uxxx>", () => {
		const msg = normalizeSlackEvent(
			{
				type: "app_mention",
				channel: "C1",
				user: "UGHOST",
				text: "<@UBOT> hi <@UOTHER>",
				ts: "1700000300.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(msg?.text).toBe("@botname hi <unknown:UOTHER>");
		expect(msg?.sender).toEqual({
			id: "UGHOST",
			username: "<unknown:UGHOST>",
			displayName: undefined,
			isBot: false,
		});
	});

	it("aggregates file metadata into attachments (app_mention with files)", () => {
		const msg = normalizeSlackEvent(
			{
				type: "app_mention",
				channel: "C1",
				user: "U1",
				text: "<@UBOT> see attached",
				ts: "1700000400.000000",
				files: [
					{
						name: "notes.pdf",
						mimetype: "application/pdf",
						size: 2048,
						url_private_download: "https://files.slack.com/notes.pdf",
					},
					{
						name: "pic.png",
						mimetype: "image/png",
						size: 512,
						url_private: "https://files.slack.com/pic.png",
					},
				],
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(msg?.attachments).toEqual([
			{
				filename: "notes.pdf",
				mimeType: "application/pdf",
				size: 2048,
				remoteUrl: "https://files.slack.com/notes.pdf",
			},
			{
				filename: "pic.png",
				mimeType: "image/png",
				size: 512,
				remoteUrl: "https://files.slack.com/pic.png",
			},
		]);
	});

	it("edit/delete/bot events return null", () => {
		const edit = normalizeSlackEvent(
			{
				type: "message",
				subtype: "message_changed",
				channel: "D1",
				channel_type: "im",
				ts: "1700000500.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(edit).toBeNull();

		const del = normalizeSlackEvent(
			{
				type: "message",
				subtype: "message_deleted",
				channel: "D1",
				channel_type: "im",
				ts: "1700000600.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(del).toBeNull();

		const bot = normalizeSlackEvent(
			{
				type: "app_mention",
				channel: "C1",
				user: BOT_USER_ID,
				text: "<@UBOT> I said this",
				ts: "1700000700.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(bot).toBeNull();

		const externalBot = normalizeSlackEvent(
			{
				type: "app_mention",
				channel: "C1",
				bot_id: "B1",
				text: "<@UBOT> ci passed",
				ts: "1700000800.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(externalBot).toBeNull();

		const empty = normalizeSlackEvent(
			{
				type: "app_mention",
				channel: "C1",
				user: "U1",
				ts: "1700000900.000000",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(empty).toBeNull();
	});

	it("preserves thread_ts as replyTo on app_mention in a channel", () => {
		const msg = normalizeSlackEvent(
			{
				type: "app_mention",
				channel: "C1",
				user: "U1",
				text: "hello <@UBOT>",
				ts: "1700001000.000100",
				thread_ts: "1700000000.000100",
			},
			{ userCache: cache, botUserId: BOT_USER_ID },
		);
		expect(msg?.isMention).toBe(true);
		expect(msg?.text).toBe("hello @botname");
		expect(msg?.replyTo).toBe("1700000000.000100");
	});
});
