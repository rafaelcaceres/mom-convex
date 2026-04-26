/**
 * Formats a step's reasoning text as the body of a Slack thread reply
 * (F-03 follow-up). Posted *before* tool-call replies of the same step
 * so the thread reads chronologically: "thought → action → result".
 *
 * Reasoning only shows up when the upstream agent has extended thinking
 * enabled at the provider level (Anthropic's `thinking` param). Without
 * it, `step.reasoningText` is empty/undefined and the caller should skip.
 */

const REASONING_LIMIT = 2500;

function truncate(s: string, limit: number): string {
	if (s.length <= limit) return s;
	return `${s.slice(0, limit)}\n…(truncated, ${s.length - limit} more chars)`;
}

export function formatReasoningReply(text: string): string {
	const body = truncate(text.trim(), REASONING_LIMIT);
	return `🧠 **reasoning**\n${body}`;
}
