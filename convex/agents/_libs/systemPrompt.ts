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
 * Kept platform-agnostic: no Slack / Discord / mrkdwn-specific phrasing.
 * Slack-only outbound translation (markdown → mrkdwn) stays in the adapter.
 */

export const MEMORY_CHAR_CAP = 10_000;

export type UserInfo = { id: string; name: string; role?: string };
export type ChannelInfo = { id: string; name: string; purpose?: string };
export type SkillInfo = { skillKey: string; name: string; description: string };

export type BuildSystemPromptInput = {
	agent: { name: string; systemPrompt: string };
	memories: Memory[];
	users: UserInfo[];
	channels: ChannelInfo[];
	skills: SkillInfo[];
};

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
	const sections: string[] = [];
	sections.push(input.agent.systemPrompt.trim());

	const users = renderUsers(input.users);
	if (users) sections.push(users);

	const channels = renderChannels(input.channels);
	if (channels) sections.push(channels);

	sections.push(renderTools(input.skills));
	sections.push(renderMemory(input.memories));

	return sections.join("\n\n");
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
