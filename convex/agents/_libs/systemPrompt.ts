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
 * Base prompt is platform-agnostic. When `platform === "slack"`, an extra
 * `## Slack Formatting` block is appended so the model emits Slack mrkdwn
 * natively — minimizing the work the outbound `markdownToMrkdwn` adapter
 * has to do (it stays in place to resolve `@username` → `<@U123>` mentions
 * and as a safety net for any standard markdown that slips through).
 */

export const MEMORY_CHAR_CAP = 10_000;

export type Platform = "slack" | "web" | "event";

export type UserInfo = { id: string; name: string; role?: string };
export type ChannelInfo = { id: string; name: string; purpose?: string };
export type SkillInfo = { skillKey: string; name: string; description: string };

export type BuildSystemPromptInput = {
	agent: { name: string; systemPrompt: string };
	memories: Memory[];
	users: UserInfo[];
	channels: ChannelInfo[];
	skills: SkillInfo[];
	platform?: Platform;
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

	const users = renderUsers(input.users);
	if (users) sections.push(users);

	const channels = renderChannels(input.channels);
	if (channels) sections.push(channels);

	sections.push(renderTools(input.skills));
	sections.push(renderMemory(input.memories));

	return sections.join("\n\n");
}

const SLACK_FORMATTING_BLOCK = [
	"## CRITICAL — Output Format: Slack mrkdwn",
	"Your response is sent directly to Slack as `text` in `chat.postMessage`. Slack does NOT render standard Markdown. You MUST emit Slack mrkdwn. Violating these rules makes the message look broken to the user.",
	"",
	"### Required syntax",
	"- Bold: `*text*` (ONE asterisk on each side). NEVER `**text**`.",
	"- Italic: `_text_` (underscores). NEVER `*text*` for italic.",
	"- Strikethrough: `~text~` (ONE tilde, not two).",
	"- Inline code: `` `code` ``.",
	"- Code block: ` ``` ` on its own line, content, ` ``` ` on its own line. Do NOT put a language tag — Slack ignores it and shows it as the first line.",
	"- Links: `<https://example.com|label>`. NEVER `[label](https://example.com)`.",
	"- Mentions: write `@username` (the adapter resolves it).",
	"- Bullet list: `- item` per line. Numbered: `1. item`.",
	"- Quote: `> text` per line.",
	"- Emojis: Slack shortcodes like `:white_check_mark:`, `:warning:`, `:rocket:`, `:slightly_smiling_face:`. Unicode emojis also work.",
	"",
	"### Forbidden — Slack ignores or renders these as raw text",
	"- Headings: `#`, `##`, `###`, `####`. Use a `*bold line*` on its own line as a section title.",
	"- Markdown tables (`| col | col |` / `| --- | --- |`). Slack has NO table support. Use a list, or a fenced code block with aligned text, or one bold label per line followed by the value.",
	"- Horizontal rules: `---`, `***`, `___`. Insert a blank line for separation.",
	"- HTML tags (`<br>`, `<b>`, etc.).",
	"- Double-asterisk bold (`**text**`) and bracket links (`[text](url)`) — these appear as literal characters.",
	"",
	"### Examples (wrong → right)",
	"- `**Pierre Bourdieu**` → `*Pierre Bourdieu*`",
	"- `### Caso 1: A vs B` → `*Caso 1: A vs B*`",
	"- `[Wikipedia](https://wiki.org)` → `<https://wiki.org|Wikipedia>`",
	"- `| Aspecto | A | B |` (table) → use bullets: `- *Aspecto:* A vs B`",
	"- `---` (rule) → blank line",
	"",
	"Comply with these rules on EVERY response in this conversation, including the very first sentence. Do not apologize for or comment on the format.",
].join("\n");

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

const SCOPE_ORDER: readonly MemoryScope[] = ["org", "agent", "thread"] as const;
const SCOPE_LABEL: Record<MemoryScope, string> = {
	org: "### Organization",
	agent: "### Agent",
	thread: "### Thread",
};

function renderMemory(memories: Memory[]): string {
	if (memories.length === 0) return "## Memory\n(none)";

	const grouped: Record<MemoryScope, Memory[]> = { org: [], agent: [], thread: [] };
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
