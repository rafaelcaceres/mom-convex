import type { Memory, MemoryScope } from "../../memory/domain/memory.model";

/**
 * System-prompt builder for a single agent turn (M2-T09). Pure function —
 * takes already-fetched context (agent metadata, alwaysOn memories, skill
 * catalog entries, optional platform users/channels) and emits a markdown
 * string. Caller (the action driving the turn) is responsible for the
 * `ctx.runQuery` hops and passes the `system` result to `agent.streamText`
 * via `AgentPrompt.system`, which overrides the baked-in `instructions` on
 * the cached `Agent` instance.
 *
 * Base prompt is platform-agnostic. When `platform === "slack"`, a short
 * `## Slack Channel` note is appended so the model knows mentions are
 * resolved server-side and can drop emoji shortcodes. Output formatting
 * (mrkdwn / Block Kit translation) is fully handled by the Slack adapter
 * via `markdownToRichText`, so we no longer ask the model to learn mrkdwn.
 */

export const MEMORY_CHAR_CAP = 10_000;

export type Platform = "slack" | "web" | "event";

export type UserInfo = { id: string; name: string; role?: string };
export type ChannelInfo = { id: string; name: string; purpose?: string };
export type SkillInfo = { skillKey: string; name: string; description: string };
/**
 * The human (or bot) who sent the message being answered this turn. Resolved
 * upstream from the polymorphic `senderId` (Slack directory or web users
 * table). `handle` is the Slack `@username` or the web email; `undefined` for
 * anonymous turns, in which case the whole identity block is omitted.
 */
export type SenderInfo = { name: string; handle?: string; isBot?: boolean };

export type BuildSystemPromptInput = {
	agent: { name: string; systemPrompt: string };
	memories: Memory[];
	users: UserInfo[];
	channels: ChannelInfo[];
	skills: SkillInfo[];
	platform?: Platform;
	sender?: SenderInfo;
};

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
	const sections: string[] = [];
	sections.push(input.agent.systemPrompt.trim());

	// Place Slack formatting rules near the top — right after the agent's
	// own instructions and BEFORE Users/Channels/Tools/Memory. Memory alone
	// can push 10k chars; if formatting rules sit at the tail, the model
	// stops attending to them and falls back to standard markdown
	// (`**bold**`, `### heading`, tables) trained-in defaults.
	if (input.platform === "slack") sections.push(SLACK_FORMATTING_BLOCK);

	// Who am I talking to right now — placed high so the model attends to it
	// before the (potentially large) Users/Memory sections push it out of
	// focus. Omitted entirely for anonymous turns.
	const sender = renderSender(input.sender);
	if (sender) sections.push(sender);

	const users = renderUsers(input.users);
	if (users) sections.push(users);

	const channels = renderChannels(input.channels);
	if (channels) sections.push(channels);

	sections.push(renderTools(input.skills));
	sections.push(renderMemory(input.memories));

	return sections.join("\n\n");
}

const SLACK_FORMATTING_BLOCK = [
	"## Slack Channel",
	"Your reply will be posted to a Slack channel. Write standard Markdown freely — bold, italic, lists, links, code, blockquotes, and tables are all rendered correctly by the adapter.",
	"- Mentions: write `@username` (resolved server-side to a real Slack mention).",
	"- Emojis: Slack shortcodes like `:white_check_mark:`, `:warning:`, `:rocket:` are welcome (and unicode emojis work too).",
	"- Avoid: HTML tags and horizontal rules (`---`) — Slack ignores them.",
].join("\n");

function renderSender(sender: SenderInfo | undefined): string | null {
	if (!sender) return null;
	const handle = sender.handle ? ` (@${sender.handle})` : "";
	const bot = sender.isBot ? " — this is a bot account, not a human" : "";
	return [
		"## Current User",
		`You are talking to **${sender.name}**${handle}${bot}. Address them by name when it feels natural, but don't overuse it.`,
	].join("\n");
}

function renderUsers(users: UserInfo[]): string | null {
	if (users.length === 0) return null;
	const lines = users.map((u) => {
		const role = u.role ? ` role=${u.role}` : "";
		return `- id=${u.id} name=${u.name}${role}`;
	});
	return `## Users\n${lines.join("\n")}`;
}

function renderChannels(channels: ChannelInfo[]): string | null {
	if (channels.length === 0) return null;
	const lines = channels.map((c) => {
		const purpose = c.purpose ? ` purpose=${c.purpose}` : "";
		return `- id=${c.id} name=${c.name}${purpose}`;
	});
	return `## Channels\n${lines.join("\n")}`;
}

function renderTools(skills: SkillInfo[]): string {
	if (skills.length === 0) return "## Tools\n(none)";
	const lines = skills.map((s) => `- \`${s.skillKey}\` — ${s.name}: ${s.description}`);
	return `## Tools\n${lines.join("\n")}`;
}

// Broadest first, most specific last — so that when the cap truncates, what
// survives is the shared context, and the model reads the narrowest facts
// closest to the task.
const SCOPE_ORDER: readonly MemoryScope[] = ["org", "agent", "channel", "thread"] as const;
const SCOPE_LABEL: Record<MemoryScope, string> = {
	org: "### Organization",
	agent: "### Agent",
	channel: "### Channel",
	thread: "### Thread",
};

function renderMemory(memories: Memory[]): string {
	if (memories.length === 0) return "## Memory\n(none)";

	const grouped: Record<MemoryScope, Memory[]> = { org: [], agent: [], channel: [], thread: [] };
	for (const m of memories) grouped[m.scope].push(m);
	for (const scope of SCOPE_ORDER) {
		grouped[scope].sort((a, b) => b._creationTime - a._creationTime);
	}

	const blocks: string[] = ["## Memory"];
	let used = 0;
	let truncated = false;

	for (const scope of SCOPE_ORDER) {
		if (grouped[scope].length === 0) continue;
		const lines: string[] = [];
		for (const m of grouped[scope]) {
			const line = `- ${m.content}`;
			if (used + line.length > MEMORY_CHAR_CAP) {
				truncated = true;
				break;
			}
			lines.push(line);
			used += line.length;
		}
		if (lines.length > 0) {
			blocks.push(`${SCOPE_LABEL[scope]}\n${lines.join("\n")}`);
		}
		if (truncated) break;
	}

	if (truncated) {
		blocks.push(
			`_Additional memories omitted (capped at ${MEMORY_CHAR_CAP.toLocaleString("en-US")} chars)._`,
		);
	}

	return blocks.join("\n");
}
