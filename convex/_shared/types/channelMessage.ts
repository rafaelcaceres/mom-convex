/**
 * Platform-agnostic message shape the agent consumes.
 *
 * Each inbound adapter (slack, web, event) is responsible for normalizing its
 * own payload into a ChannelMessage. The agent never sees platform-specific
 * constructs like `<@U123>` — those get resolved to `@username` here.
 *
 * See [docs/new.md §ChannelMessage](../../../docs/new.md).
 */
export interface ChannelMessage {
	/** Unique id within the channel (platform-specific format preserved). */
	id: string;
	/** Channel / conversation id (platform-specific). */
	channelId: string;
	/** ISO 8601 timestamp. */
	timestamp: string;
	/** Parent message id for threaded conversations (Slack `thread_ts`). */
	replyTo?: string;
	sender: {
		id: string;
		username: string;
		displayName?: string;
		isBot: boolean;
	};
	/** Cleaned text — user/bot mentions resolved to `@username`. */
	text: string;
	/** Original platform text, kept for debugging / audit. */
	rawText?: string;
	attachments: ChannelAttachment[];
	/** True when the message directly addresses the bot (mention or DM). */
	isMention: boolean;
	/** Platform-specific escape hatch (not consumed by the agent). */
	metadata?: Record<string, unknown>;
}

export interface ChannelAttachment {
	filename: string;
	mimeType?: string;
	size?: number;
	/** Remote URL on the source platform (Slack: `url_private_download`). */
	remoteUrl?: string;
	/** Populated after the file is downloaded into storage (M2). */
	localPath?: string;
}
