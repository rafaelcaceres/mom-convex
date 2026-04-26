import { describe, expect, it } from "vitest";
import { splitMrkdwnIntoChunks } from "./splitMrkdwn";

describe("splitMrkdwnIntoChunks", () => {
	it("returns single chunk verbatim when under limit", () => {
		const out = splitMrkdwnIntoChunks("hello world", 4000);
		expect(out).toEqual(["hello world"]);
	});

	it("splits long text into multiple chunks each within the limit", () => {
		const text = "abcdef\n".repeat(2000); // 14 000 chars
		const limit = 4000;
		const chunks = splitMrkdwnIntoChunks(text, limit);

		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) expect(c.length).toBeLessThanOrEqual(limit);
	});

	it("appends pagination suffix when chunked", () => {
		const text = "x".repeat(10_000);
		const chunks = splitMrkdwnIntoChunks(text, 4000);
		expect(chunks.at(0)).toMatch(/_\(continua 1\/\d+\)_$/);
		expect(chunks.at(-1)).toMatch(/_\(fim \d+\/\d+\)_$/);
	});

	it("does not append suffix when text fits in one chunk", () => {
		const out = splitMrkdwnIntoChunks("short", 4000);
		expect(out[0]).toBe("short");
		expect(out[0]).not.toContain("continua");
		expect(out[0]).not.toContain("fim");
	});

	it("prefers paragraph breaks over mid-word cuts", () => {
		const para = `${"a".repeat(2000)}\n\n${"b".repeat(2000)}\n\n${"c".repeat(2000)}`;
		const chunks = splitMrkdwnIntoChunks(para, 4000);
		// The first chunk should end at a paragraph boundary, not mid-`a`.
		expect(chunks[0]?.startsWith("a".repeat(2000))).toBe(true);
		expect(chunks[0]?.includes("b".repeat(2000))).toBe(false);
	});

	it("rebalances triple-backtick fences across chunks", () => {
		// A code block that fits within one budget but the surrounding
		// text forces a split mid-fence.
		const before = "intro\n\n";
		const code = `\`\`\`js\n${"console.log('x');\n".repeat(300)}\`\`\``;
		const after = "\n\noutro";
		const text = before + code + after;
		const chunks = splitMrkdwnIntoChunks(text, 1500);

		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			const fenceCount = (c.match(/```/g) ?? []).length;
			expect(fenceCount % 2).toBe(0); // each chunk has balanced fences
		}
	});

	it("hard-cuts a single oversized run that has no breakpoints", () => {
		const text = "a".repeat(12_000);
		const chunks = splitMrkdwnIntoChunks(text, 4000);
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4000);
	});

	it("each chunk including suffix is within limit", () => {
		const text = "lorem ipsum dolor sit amet ".repeat(800);
		const limit = 4000;
		const chunks = splitMrkdwnIntoChunks(text, limit);
		for (const c of chunks) expect(c.length).toBeLessThanOrEqual(limit);
	});
});
