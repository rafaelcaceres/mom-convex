import type { ChannelAttachment, ChannelMessage } from "../../_shared/types/channelMessage";

export interface SlackUserRecord {
	username: string;
	displayName?: string;
	isBot?: boolean;
}

export type SlackUserCache = Map<string, SlackUserRecord>;

interface SlackFile {
	name?: string;
	mimetype?: string;
	size?: number;
	url_private?: string;
	url_private_download?: string;
}

/**
 * Shape of a Slack event as it arrives inside `event_callback.event`.
 * Intentionally loose: Slack sends many event types; we pick only the
 * fields we care about and let unknowns flow through as `unknown`.
 */
export interface SlackInboundEvent {
	type: string;
	channel?: string;
	channel_type?: string;
	user?: string;
	bot_id?: string;
	text?: string;
	ts: string;
	thread_ts?: string;
	subtype?: string;
	files?: SlackFile[];
	[extra: string]: unknown;
}

export interface NormalizeContext {
	userCache: SlackUserCache;
	botUserId: string;
}

const MENTION_RE = /<@([A-Z0-9]+)>/g;
const IGNORED_SUBTYPES = new Set([
	"message_changed",
	"message_deleted",
	"bot_message",
	"tombstone",
]);

function tsToIso(ts: string): string {
	const [secStr, fracStr = "0"] = ts.split(".");
	const sec = Number(secStr);
	const micro = Number(fracStr.padEnd(6, "0").slice(0, 6));
	if (!Number.isFinite(sec)) return new Date(0).toISOString();
	const ms = sec * 1000 + Math.floor(micro / 1000);
	return new Date(ms).toISOString();
}

function replaceMentions(text: string, cache: SlackUserCache): string {
	return text.replace(MENTION_RE, (_, userId: string) => {
		const record = cache.get(userId);
		return record ? `@${record.username}` : `<unknown:${userId}>`;
	});
}

function mapFiles(files: SlackFile[] | undefined): ChannelAttachment[] {
	if (!files || files.length === 0) return [];
	return files.map((f) => ({
		filename: f.name ?? "file",
		mimeType: f.mimetype,
		size: f.size,
		remoteUrl: f.url_private_download ?? f.url_private,
	}));
}

function resolveSender(
	userId: string,
	cache: SlackUserCache,
	botUserId: string,
): ChannelMessage["sender"] {
	const record = cache.get(userId);
	return {
		id: userId,
		username: record?.username ?? `<unknown:${userId}>`,
		displayName: record?.displayName,
		isBot: record?.isBot ?? userId === botUserId,
	};
}

/**
 * Pure: convert a Slack event into the platform-agnostic ChannelMessage the
 * agent consumes. Returns `null` for events we intentionally ignore
 * (edits, deletes, bot echoes, empty messages).
 */
export function normalizeSlackEvent(
	event: SlackInboundEvent,
	ctx: NormalizeContext,
): ChannelMessage | null {
	// Slack delivers a channel mention twice: once as `app_mention` and once as
	// `message` (because the bot has channels:history). We drop the `message`
	// copy when it's in a non-DM channel — app_mention is the canonical path.
	// DMs (`channel_type: "im"`) are kept because there's no app_mention there.
	if (event.type !== "app_mention" && event.type !== "message") return null;
	if (event.type === "message" && event.channel_type !== "im") return null;

	if (event.subtype && IGNORED_SUBTYPES.has(event.subtype) && event.subtype !== "file_share") {
		return null;
	}
	if (event.bot_id) return null;
	if (!event.user) return null;
	if (event.user === ctx.botUserId) return null;
	if (!event.channel) return null;

	const rawText = event.text ?? "";
	const attachments = mapFiles(event.files);
	if (!rawText && attachments.length === 0) return null;

	const cleanedText = replaceMentions(rawText, ctx.userCache).trim();

	const isAppMention = event.type === "app_mention";
	const isDm = event.channel_type === "im";
	const mentionsBot = rawText.includes(`<@${ctx.botUserId}>`);
	const isMention = isAppMention || isDm || mentionsBot;

	return {
		id: event.ts,
		channelId: event.channel,
		timestamp: tsToIso(event.ts),
		replyTo: event.thread_ts,
		sender: resolveSender(event.user, ctx.userCache, ctx.botUserId),
		text: cleanedText,
		rawText,
		attachments,
		isMention,
	};
}
