/**
 * Formats one tool call (and its result, when available) as the body of a
 * Slack thread reply (F-03). Output is plain markdown — `markdownToMrkdwn`
 * runs over it before posting, so triple-backtick fences and bold work.
 *
 * Args/output get serialized as JSON and truncated so a giant
 * `http.fetch` body can't blow past Slack's per-message limit.
 *
 * `durationMs` is rendered as `(N.Ns)` next to the tool name when the
 * caller has timing data — useful for spotting slow tools at a glance.
 */

const ARGS_LIMIT = 1500;
const OUTPUT_LIMIT = 2500;

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function truncate(s: string, limit: number): string {
	if (s.length <= limit) return s;
	return `${s.slice(0, limit)}\n…(truncated, ${s.length - limit} more chars)`;
}

function formatDuration(durationMs: number | undefined): string {
	if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) return "";
	if (durationMs < 1000) return ` (${durationMs}ms)`;
	return ` (${(durationMs / 1000).toFixed(1)}s)`;
}

export function formatToolReply(args: {
	toolName: string;
	input: unknown;
	output?: unknown;
	hasOutput: boolean;
	error?: unknown;
	durationMs?: number;
}): string {
	const argsJson = truncate(safeJson(args.input), ARGS_LIMIT);
	const header = `🔧 \`${args.toolName}\`${formatDuration(args.durationMs)}`;
	const argsBlock = `**args**\n\`\`\`json\n${argsJson}\n\`\`\``;
	if (args.error !== undefined && args.error !== null) {
		const errText = truncate(safeJson(args.error), OUTPUT_LIMIT);
		return `${header}\n${argsBlock}\n**error**\n\`\`\`\n${errText}\n\`\`\``;
	}
	if (!args.hasOutput) {
		return `${header}\n${argsBlock}\n_(running…)_`;
	}
	const outJson = truncate(safeJson(args.output), OUTPUT_LIMIT);
	return `${header}\n${argsBlock}\n**result**\n\`\`\`\n${outJson}\n\`\`\``;
}
