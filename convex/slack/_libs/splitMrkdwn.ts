/**
 * Splits a Slack mrkdwn string into chunks that each fit under Slack's
 * per-message `text` cap (~4 000 chars in practice — `chat.postMessage`
 * and `chat.update` reject longer payloads with `msg_too_long`, despite
 * docs claiming 40 000).
 *
 * Splitting strategy:
 *   1. If the input already fits, return `[input]` unchanged (no suffix).
 *   2. Otherwise, walk segment boundaries in order of preference —
 *      blank-line paragraphs (`\n\n`), then single newlines, then word
 *      boundaries — picking the latest break before `budget`. If none
 *      exists (e.g. a 5 000-char URL), hard-cut at `budget`.
 *   3. Triple-backtick fences are kept balanced: a fence opened in chunk
 *      N is closed at end of chunk N and reopened at the start of N+1
 *      with the same language tag, so each chunk renders as valid mrkdwn.
 *   4. Each chunk gets a 1-based pagination suffix once `chunks.length>1`
 *      (`_(continua i/M)_` / `_(fim M/M)_`). The suffix budget is
 *      reserved up-front, so the appended chunk never exceeds `limit`.
 *
 * Pure / no I/O — easy to test and reuse outside the painter.
 */

const SUFFIX_RESERVE = 40;
const FENCE_RE = /```([^\n`]*)\n?/g;

function findOpenFenceLang(text: string): string | null {
	let match: RegExpExecArray | null;
	let open: string | null = null;
	const re = new RegExp(FENCE_RE.source, "g");
	// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex iteration
	while ((match = re.exec(text)) !== null) {
		open = open === null ? (match[1] ?? "") : null;
	}
	return open;
}

function pickBreakpoint(slice: string): number {
	const paragraph = slice.lastIndexOf("\n\n");
	if (paragraph > slice.length * 0.4) return paragraph + 2;
	const newline = slice.lastIndexOf("\n");
	if (newline > slice.length * 0.4) return newline + 1;
	const space = slice.lastIndexOf(" ");
	if (space > slice.length * 0.4) return space + 1;
	return slice.length;
}

export function splitMrkdwnIntoChunks(text: string, limit: number): string[] {
	if (text.length <= limit) return [text];

	const budget = Math.max(100, limit - SUFFIX_RESERVE);
	const raw: string[] = [];
	let cursor = 0;

	while (cursor < text.length) {
		const remaining = text.length - cursor;
		if (remaining <= budget) {
			raw.push(text.slice(cursor));
			break;
		}
		const slice = text.slice(cursor, cursor + budget);
		const cut = pickBreakpoint(slice);
		raw.push(text.slice(cursor, cursor + cut));
		cursor += cut;
	}

	// Balance fences across chunks: if a chunk leaves a fence open, close
	// it and reopen on the next chunk with the same language tag.
	let carryLang: string | null = null;
	const balanced = raw.map((piece) => {
		let body = piece;
		if (carryLang !== null) body = `\`\`\`${carryLang}\n${body}`;
		const open = findOpenFenceLang(body);
		if (open !== null) body = `${body}\n\`\`\``;
		carryLang = open;
		return body;
	});

	if (balanced.length === 1) return balanced;

	return balanced.map((piece, i) => {
		const tag = i === balanced.length - 1
			? `_(fim ${i + 1}/${balanced.length})_`
			: `_(continua ${i + 1}/${balanced.length})_`;
		return `${piece}\n\n${tag}`;
	});
}
