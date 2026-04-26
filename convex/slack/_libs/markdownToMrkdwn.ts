/**
 * Standard-markdown → Slack mrkdwn.
 *
 * Strategy: carve out protected spans (triple-backtick fences first, then
 * inline backtick code) with unique sentinels, transform the gaps, then
 * reinsert the spans verbatim. Inside code, nothing is interpreted — that
 * matches how Slack itself renders mrkdwn.
 *
 * Conversion rules applied to the non-code gaps:
 *   - `# / ## / ### / ####` headings → `*bold*` line (Slack mrkdwn has no
 *                                       headings; otherwise the `###` prefix
 *                                       leaks into the rendered message)
 *   - `**bold**`    → `*bold*`                      (bold marker goes first)
 *   - `*italic*`    → `_italic_`                    (applied AFTER bold, via
 *                     a temporary marker so the single-asterisk left by bold
 *                     conversion doesn't get re-italicized)
 *   - `~~strike~~`  → `~strike~`
 *   - `[t](url)`    → `<url|t>`
 *   - `@username`   → `<@U123>` when `userMap` has the handle; otherwise
 *                     left as-is
 */

export interface MarkdownToMrkdwnOptions {
	/** `username` → Slack user id. Unknown usernames pass through unchanged. */
	userMap?: Map<string, string>;
}

const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
// Up to 4 leading `#` (covers H1–H4); H5/H6 are uncommon and would render
// the same. Multiline so `^` matches every line, not just the start of input.
const HEADING_RE = /^#{1,4}\s+(.+?)\s*#*\s*$/gm;
// Bold/italic require non-whitespace immediately inside the markers so a
// markdown bullet line like `* item` (asterisk + space) doesn't get
// misinterpreted as italic that swallows everything up to the next `*`
// (typically the next bullet on the next line). Standard CommonMark
// emphasis rules. The single-char form (`*x*`) is handled by allowing
// the captured run to be a single non-whitespace char.
const BOLD_RE = /\*\*(\S(?:[^*]*?\S)?)\*\*/g;
const ITALIC_RE = /\*(\S(?:[^*]*?\S)?)\*/g;
const STRIKE_RE = /~~(\S(?:[^~]*?\S)?)~~/g;
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const MENTION_RE = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_.\-]+)/g;

const SENTINEL_START = "\u0000";
const SENTINEL_END = "\u0001";

function extractSpans(input: string, re: RegExp, tag: string): { text: string; spans: string[] } {
	const spans: string[] = [];
	const text = input.replace(re, (match) => {
		const idx = spans.push(match) - 1;
		return `${SENTINEL_START}${tag}${idx}${SENTINEL_END}`;
	});
	return { text, spans };
}

function restoreSpans(text: string, tag: string, spans: string[]): string {
	const re = new RegExp(`${SENTINEL_START}${tag}(\\d+)${SENTINEL_END}`, "g");
	return text.replace(re, (_, idx: string) => spans[Number(idx)] ?? "");
}

function transformMentions(text: string, userMap: Map<string, string> | undefined): string {
	if (!userMap) return text;
	return text.replace(MENTION_RE, (match, lead: string, handle: string) => {
		const id = userMap.get(handle);
		return id ? `${lead}<@${id}>` : match;
	});
}

const BOLD_MARKER_START = "\u0002B";
const BOLD_MARKER_END = "B\u0003";

export function markdownToMrkdwn(input: string, opts: MarkdownToMrkdwnOptions = {}): string {
	const fence = extractSpans(input, FENCE_RE, "F");
	const inline = extractSpans(fence.text, INLINE_CODE_RE, "I");

	let text = inline.text;
	// Headings → bold line. Done BEFORE the bold pass so the bold marker can
	// shield the heading text from the italic pass too. Trailing `#` markers
	// (e.g. `## Title ##`) are stripped.
	text = text.replace(
		HEADING_RE,
		(_, inner: string) => `${BOLD_MARKER_START}${inner}${BOLD_MARKER_END}`,
	);
	// Bold next, parked behind a marker so the italic pass can't re-catch
	// the lone asterisks bold leaves behind.
	text = text.replace(
		BOLD_RE,
		(_, inner: string) => `${BOLD_MARKER_START}${inner}${BOLD_MARKER_END}`,
	);
	text = text.replace(ITALIC_RE, "_$1_");
	text = text.split(BOLD_MARKER_START).join("*").split(BOLD_MARKER_END).join("*");
	text = text.replace(STRIKE_RE, "~$1~");
	text = text.replace(LINK_RE, "<$2|$1>");
	text = transformMentions(text, opts.userMap);

	text = restoreSpans(text, "I", inline.spans);
	text = restoreSpans(text, "F", fence.spans);
	return text;
}
