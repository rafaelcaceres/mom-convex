import { describe, expect, it } from "vitest";
import { MAX_SLACK_CHARS, splitForSlack } from "./splitForSlack";

describe("M1-T10 splitForSlack", () => {
	it("returns a single chunk untouched when under the limit", () => {
		const text = "short message";
		expect(splitForSlack(text)).toEqual([text]);
	});

	it("splits oversized plain text into chunks all under the limit", () => {
		const chunkBody = "para ".repeat(1000);
		const text = `${chunkBody}\n\n${chunkBody}\n\n${chunkBody}`;
		const chunks = splitForSlack(text);
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(c.length).toBeLessThanOrEqual(MAX_SLACK_CHARS);
		}
	});

	it("prefixes continuation chunks with _(continued)_", () => {
		const body = "x".repeat(MAX_SLACK_CHARS - 50);
		const text = `${body}\n\n${body}`;
		const chunks = splitForSlack(text);
		expect(chunks.length).toBeGreaterThan(1);
		for (let i = 1; i < chunks.length; i++) {
			expect(chunks[i]?.startsWith("_(continued)_")).toBe(true);
		}
	});

	it("does not break the middle of a fenced code block", () => {
		const filler = "line-of-preamble\n".repeat(250);
		const codeBody = "CODEY\n".repeat(400);
		const text = `${filler}\`\`\`\n${codeBody}\`\`\`\n${filler}`;
		const chunks = splitForSlack(text);
		expect(chunks.length).toBeGreaterThan(1);
		// every chunk must have balanced fences
		for (const c of chunks) {
			const fences = (c.match(/```/g) ?? []).length;
			expect(fences % 2).toBe(0);
		}
	});

	it("closes and re-opens the fence when the code block itself exceeds the limit", () => {
		const codeLine = "X".repeat(80);
		// huge code block, forces split mid-block
		const body = `${codeLine}\n`.repeat(200);
		const text = `\`\`\`\n${body}\`\`\``;
		const chunks = splitForSlack(text);
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			const fences = (c.match(/```/g) ?? []).length;
			expect(fences % 2).toBe(0);
			expect(c.length).toBeLessThanOrEqual(MAX_SLACK_CHARS);
		}
	});
});
