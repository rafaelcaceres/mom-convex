/**
 * Split a mrkdwn message into chunks that fit Slack's `chat.postMessage`
 * limit. Respects fenced code blocks: if a split lands inside a block we
 * close with ``` on the outgoing chunk and reopen with the original fence
 * (including language hint) on the incoming one.
 *
 * Continuation chunks are prefixed with `_(continued)_` so a reader scrolling
 * through a thread knows the message is still the same turn.
 */

export const MAX_SLACK_CHARS = 4000;
const CONTINUATION = "_(continued)_\n";
const FENCE = "```";

export function splitForSlack(text: string, maxChars = MAX_SLACK_CHARS): string[] {
	if (text.length <= maxChars) return [text];

	const lines = text.split("\n");
	const chunks: string[] = [];
	let current = "";
	let inCode = false;
	let fenceOpener = "";

	const reserveForClose = () => (inCode ? FENCE.length + 1 : 0);

	const flush = () => {
		let final = current;
		if (inCode) final += `${FENCE}\n`;
		chunks.push(final.replace(/\n+$/, ""));
		current = CONTINUATION;
		if (inCode) current += `${fenceOpener}\n`;
	};

	for (let raw of lines) {
		while (raw.length > maxChars - current.length - reserveForClose() - 1) {
			// If current has content, flush; otherwise we need a hard char split.
			if (
				current.length === 0 ||
				current === CONTINUATION ||
				(inCode && current.endsWith(`${fenceOpener}\n`))
			) {
				const room = Math.max(1, maxChars - current.length - reserveForClose() - 1);
				current += `${raw.slice(0, room)}\n`;
				raw = raw.slice(room);
				flush();
			} else {
				flush();
			}
		}

		const lineWithNl = `${raw}\n`;
		if (
			current.length > 0 &&
			current !== CONTINUATION &&
			!(inCode && current === `${CONTINUATION}${fenceOpener}\n`) &&
			current.length + lineWithNl.length + reserveForClose() > maxChars
		) {
			flush();
		}

		current += lineWithNl;

		const trimmed = raw.trimStart();
		if (trimmed.startsWith(FENCE)) {
			if (!inCode) {
				inCode = true;
				fenceOpener = raw;
			} else {
				inCode = false;
				fenceOpener = "";
			}
		}
	}

	if (current.replace(/\s/g, "").length > 0 && current !== CONTINUATION) {
		chunks.push(current.replace(/\n+$/, ""));
	}
	return chunks;
}
